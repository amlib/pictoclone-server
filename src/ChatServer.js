import { ChatRoom } from "./ChatRoom.js";
import {generateRoomCode, generateUniqueId} from "./Utils.js";

import {
  messageTypesStr, messageTypesInt,
  errorsStr,
  decodeMessage, nameSize, colorIndexSize, maxIncomingPayloadSize
} from './specs.js'

export class ChatServer {
  incomingMessageMap = new Map()
  flusherPeriod = 1000

  roomCodeMap = new Map() // 9999: ChatRoom()
  uniqueIdSocketMap = new Map() // 1234: ws()
  roomFlushQueue = new Set() // [ChatRoom(), ChatRoom(), ...]

  constructor () {
    this.incomingMessageMap.set(messageTypesStr.get('MSG_TYPE_CREATE_ROOM'), this.handleCreateRoom)
    this.incomingMessageMap.set(messageTypesStr.get('MSG_TYPE_CONNECT_ROOM'), this.handleConnectRoom)
    this.incomingMessageMap.set(messageTypesStr.get('MSG_TYPE_SEND_CHAT_MESSAGE'), this.handleSendChatMessage)
    this.incomingMessageMap.set(messageTypesStr.get('MSG_TYPE_LEAVE_ROOM'), this.handleLeaveRoom)

    // TODO chatQueueFlusher needs to be threaded before its any use...
    // this.chatQueueFlusher() // TODO add way to stop it
  }

  addNewConnection (ws) {
    let uniqueId
    do {
      uniqueId = generateUniqueId()
    } while (this.uniqueIdSocketMap.get(uniqueId) != null)

    ws.uniqueId = uniqueId
    this.uniqueIdSocketMap.set(uniqueId, ws)

    global.debug && console.log('ChatServer.addNewConnection:', uniqueId);

    let response = {
      type: messageTypesStr.get('MSG_TYPE_NEW_CONNECTION_RESULT'),
      uniqueId: uniqueId
    }
    return response
  }

  closeConnection (ws) {
    const currentRoom = ws.room
    global.debug && console.log('ChatServer.closeConnection:', ws.uniqueId);

    if (currentRoom != null) {
      this.removeUserFromRoom(currentRoom, ws)
    }

    if (ws.lastCreatedRoom != null && ws.lastCreatedRoom !== currentRoom) {
      if (ws.lastCreatedRoom.isEmpty()) {
        this.closeRoom(ws.lastCreatedRoom)
      }
    }

    this.uniqueIdSocketMap.delete(ws.uniqueId)
  }

  removeUserFromRoom (room, ws) {
    room.removeUser(ws)
    if (room.isEmpty()) {
      this.closeRoom(room)
    }
  }

  openRoom (code = null) {
    if (code == null) {
      do {
        code = generateRoomCode()
      } while (this.roomCodeMap.get(code) != null)
    }

    global.debug && console.log('ChatServer.openRoom:', code);

    const room = new ChatRoom(code)
    this.roomCodeMap.set(room.code, room)
    return room
  }

  closeRoom (room) {
    global.debug && console.log('ChatServer.closeRoom:', room.code);
    room.open = false
    this.roomCodeMap.delete(room.code)
  }

  /* Chat queue */

  async chatQueueFlusher () {
    let roomFlushQueue
    let timeStamp = 0, previousTimestamp = 0

    while (true) {
      previousTimestamp = timeStamp
      timeStamp = performance.now()
      const timeStampDelta = timeStamp - previousTimestamp
      const overheadTime = timeStampDelta - this.flusherPeriod

      if (this.roomFlushQueue.size > 0) {
        roomFlushQueue = this.roomFlushQueue
        this.roomFlushQueue = new Set()
      }

      const period = Math.min(Math.max(this.flusherPeriod - overheadTime , 10), this.flusherPeriod)
      // console.log({ timeStampDelta, overheadTime, period })
      await new Promise(resolve => setTimeout(resolve, period))

      if (roomFlushQueue != null && roomFlushQueue.size > 0) {
        this.flushChatQueue(roomFlushQueue)
        roomFlushQueue = null
      }
    }
  }

  async flushChatQueue (roomFlushQueue) {
     try {
       for (let room of roomFlushQueue) {
         room.flushChatMessageQueueToRecipients()
       }
     } catch (e) {
       global.debug && console.error('ChatServer.flushChatQueue error when flushing chat queue:', e)
     }
   }

  /* Incoming message handlers */

  handleIncomingMessage (message, payload, payloadOffset, ws) {
    if (message.type == null || payload.byteLength > maxIncomingPayloadSize.get(message.type)) {
      return null
    }

    let response = {}
    if (message.uniqueId == null) {
      response.type = messageTypesStr.get(messageTypesInt.get(message.type) + '_RESULT')
      response.success = false
      response.errorCode = errorsStr.get('ERROR_NO_UNIQUE_ID')
      response.errorMessage = ''
      return response
    }

    if (message.uniqueId < 0 || message.uniqueId !== ws.uniqueId) {
      response.type = messageTypesStr.get(messageTypesInt.get(message.type) + '_RESULT')
      response.success = false
      response.errorCode = errorsStr.get('ERROR_INVALID_UNIQUE_ID')
      response.errorMessage = ''
      return response
    }

    const callback = this.incomingMessageMap.get(message.type)
    if (callback != null) {
      global.debug && console.log('ClientServer.handleIncomingMessage:', messageTypesInt.get(message.type), message.uniqueId, payload.byteLength)
      const newPayloadOffset = decodeMessage(message, payload, payloadOffset)
      response = callback.call(this, message, ws)
    } else {
      global.debug && console.warn('handleIncomingMessage: unknown message type, ignoring: ' + message.type)
    }

    return response
  }

  handleCreateRoom (message, ws) {
    const response = {
      type: messageTypesStr.get('MSG_TYPE_CREATE_ROOM_RESULT'),
      uniqueId: message.uniqueId
    }

    if (ws.lastCreatedRoom != null) {
      if (ws.lastCreatedRoom.isEmpty()) {
        this.closeRoom(ws.lastCreatedRoom)
      }
    }

    const newRoom = this.openRoom()

    ws.lastCreatedRoom = newRoom
    response.success = true
    response.code = newRoom.code
    return response
  }

  handleConnectRoom (message, ws) {
    const response = {
      type: messageTypesStr.get('MSG_TYPE_CONNECT_ROOM_RESULT'),
      uniqueId: message.uniqueId
    }

    if (ws.room != null) {
      response.success = false
      response.errorCode = errorsStr.get('ERROR_ROOM_ALREADY_IN_A_ROOM')
      response.errorMessage = 'User already in a room'
      return response
    }

    let existingRoom = this.roomCodeMap.get(message.code)

    // old behaviour of opening rooms with specific codes
    // if (existingRoom == null) {
    //   existingRoom = this.openRoom(message.code)
    // }

    if (existingRoom == null) {
      response.success = false
      response.errorCode = errorsStr.get('ERROR_ROOM_DOES_NOT_EXISTS')
      response.errorMessage = 'Room ' + message.code + ' does not exists'
      return response
    }

    if (!existingRoom.checkFreeSlot()) {
      response.success = false
      response.errorCode = errorsStr.get('ERROR_ROOM_NO_FREE_SLOTS')
      response.errorMessage = 'Room ' + message.code + ' is full'
      return response
    }

    if (!existingRoom.checkFreeUserName(message.userName)) {
      response.success = false
      response.errorCode = errorsStr.get('ERROR_ROOM_USER_ALREADY_TAKEN')
      response.errorMessage = 'User ' + message.userName + ' already taken for this room'
      return response
    }

    if (message.userName == null || message.length <= 0 || message === '' || message.userName.length > nameSize) {
      response.success = false
      response.errorCode = errorsStr.get('ERROR_INVALID_USER_NAME')
      response.errorMessage = 'Invalid username'
      return response
    }

    if (message.colorIndex == null || message.colorIndex < 0 || message.colorIndex > (colorIndexSize - 1)) {
      response.success = false
      response.errorCode = errorsStr.get('ERROR_INVALID_COLOR_INDEX')
      response.errorMessage = 'Invalid color index'
      return response
    }

    existingRoom.addUser(message.uniqueId, message.userName, message.colorIndex, ws)

    // TODO send publicId back?
    response.success = true
    return response
  }

  handleLeaveRoom (message, ws) {
    const response = {
      type: messageTypesStr.get('MSG_TYPE_LEAVE_ROOM_RESULT'),
      uniqueId: message.uniqueId
    }

    const currentRoom = ws.room

    if (currentRoom != null) {
      this.removeUserFromRoom(currentRoom, ws)
    } else {
      response.success = false
      response.errorCode = errorsStr.get('ERROR_ROOM_NOT_IN_ANY_ROOM')
      response.errorMessage = 'UniqueId ' + message.uniqueId + ' not in any room'
      return response
    }

    response.success = true
    return response
  }

  handleSendChatMessage (message, ws) {
    const response = {
      type: messageTypesStr.get('MSG_TYPE_SEND_CHAT_MESSAGE_RESULT'),
      uniqueId: message.uniqueId
    }

    const existingRoom = ws.room
    if (existingRoom == null || !existingRoom.open) {
      response.success = false
      response.errorCode = errorsStr.get('ERROR_ROOM_DOES_NOT_EXISTS')
      response.errorMessage = 'Your uniqueId is not associated with any room'
      return response
    }

    existingRoom.addMessage(message, response, ws)
    if (!response.success) {
      return response
    }

    this.roomFlushQueue.add(existingRoom)

    return response
  }
}
