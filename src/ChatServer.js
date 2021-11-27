import { ChatRoom } from "./ChatRoom.js";
import { messageTypesStr, messageTypesInt } from "./enums.js";

export class ChatServer {
  incomingMessageMap = new Map()

  chatRooms = []
  roomCodeMap = new Map() // 9999: Room()
  uniqueIdRoomMap = new Map() // 1234: Room()
  uniqueIdSocketMap = new Map() // 1234: ws()
  roomFlushQueue = new Set()
  queueFlushTimeout

  constructor () {
    this.incomingMessageMap.set('createRoom', this.createRoom)
    this.incomingMessageMap.set('connectRoom', this.connectRoom)
    this.incomingMessageMap.set('sendChatMessage', this.sendChatMessage)
  }

  addNewConnection (ws) {
    const uniqueId = Math.round(Math.random() * 100000) // TODO use uuid
    ws.uniqueId = uniqueId
    console.log('A WebSocket connected!', uniqueId);

    let response = {
      type: 'newConnectionResult',
      uniqueId: uniqueId
    }

    this.uniqueIdSocketMap.set(uniqueId, ws)

    return response
  }

  /* Incoming message */

  handleIncomingMessage (message, ws) {
    let response = {}

    if (message.type == null) {
      return null
    }

    if (message.uniqueId == null) {
      response.type = message.type + 'Result'
      response.success = false
      response.errorCode = 'ERROR_NO_UNIQUE_ID'
      response.errorMessage = ''
      return response
    }

    // TODO check if uniqueId _value_ is valid?

    if (message.uniqueId !== ws.uniqueId) {
      response.type = message.type + 'Result'
      response.success = false
      response.errorCode = 'ERROR_INVALID_UNIQUE_ID'
      response.errorMessage = ''
      return response
    }

    const callback = this.incomingMessageMap.get(message.type)
    if (callback != null) {
      console.log('handleIncomingMessage:', message.type, message.uniqueId)
      response = callback.call(this, message)
    } else {
      console.warn('handleIncomingMessage: unknown message type: ' + message.type)
    }

    return response
  }

  createRoom (message) {
    const response = {
      type: 'createRoomResult',
      code: message.code,
    }

    const existingRoom = this.roomCodeMap.get(message.code)
    if (existingRoom != null) {
      response.success = false
      response.errorCode = 'ERROR_ROOM_ALREADY_EXISTS'
      response.errorMessage = 'Room ' + message.code + ' already exists'
      return response
    }

    const chatRoom = new ChatRoom(message.code)

    this.roomCodeMap.set(chatRoom.code, chatRoom)
    this.chatRooms.push(chatRoom)

    response.success = true
    return response
  }

  connectRoom (message) {
    const response = {
      type: 'connectRoomResult',
      code: message.code,
    }

    // Check if username invalid (empty +)

    const existingRoom = this.roomCodeMap.get(message.code)
    if (existingRoom == null) {
      response.success = false
      response.errorCode = 'ERROR_ROOM_DOES_NOT_EXISTS'
      response.errorMessage = 'Room ' + message.code + ' does not exists'
      return response
    }

    if (!existingRoom.checkFreeSlot) {
      response.success = false
      response.errorCode = 'ERROR_ROOM_NO_FREE_SLOTS'
      response.errorMessage = 'Room ' + message.code + ' is full'
      return response
    }

    if (!existingRoom.checkFreeUserName(message.userName)) {
      response.success = false
      response.errorCode = 'ERROR_ROOM_USER_ALREADY_TAKEN'
      response.errorMessage = 'User ' + message.userName + ' already taken for this room'
      return response
    }

    this.uniqueIdRoomMap.set(message.uniqueId, existingRoom)
    existingRoom.addUser(message.uniqueId, message.userName, '#F00')

    response.success = true
    return response
  }

  sendChatMessage (message) {
    const response = {
      type: 'sendChatMessageResult'
    }

    const existingRoom = this.uniqueIdRoomMap.get(message.uniqueId)
    response.success = existingRoom.addMessage(message.uniqueId, message.messagePayload)
    // add room to a map of to be flushed room message queues
    // something will eventually actually flush all queues and get messages delivered...
    this.roomFlushQueue.add(existingRoom)
    if (this.queueFlushTimeout == null) {
      this.queueFlushTimeout = setTimeout(() => {
        for (let room of this.roomFlushQueue) {
          room.flushChatMessageQueueToRecipients(this.uniqueIdSocketMap)
        }
        this.queueFlushTimeout = undefined
      }, 1500)
    }

    return response
  }
}
