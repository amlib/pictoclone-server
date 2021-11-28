import { ChatRoom } from "./ChatRoom.js";
import { generateUniqueId } from "./Utils.js";

import {
  messageTypesStr, messageTypesInt,
  errorsStr, errorsInt,
  decodeMessage, nameSize, colorIndexSize
} from './specs.js'

export class ChatServer {
  incomingMessageMap = new Map()

  roomCodeMap = new Map() // 9999: ChatRoom()
  uniqueIdRoomMap = new Map() // 1234: ChatRoom()
  uniqueIdSocketMap = new Map() // 1234: ws()
  roomFlushQueue = new Set() // [ChatRoom(), ChatRoom(), ...]
  queueFlushTimeout

  constructor () {
    this.incomingMessageMap.set(messageTypesStr.get('MSG_TYPE_CREATE_ROOM'), this.handleCreateRoom)
    this.incomingMessageMap.set(messageTypesStr.get('MSG_TYPE_CONNECT_ROOM'), this.handleConnectRoom)
    this.incomingMessageMap.set(messageTypesStr.get('MSG_TYPE_SEND_CHAT_MESSAGE'), this.handleSendChatMessage)
    this.incomingMessageMap.set(messageTypesStr.get('MSG_TYPE_LEAVE_ROOM'), this.handleLeaveRoom)

    this.chatQueueFlusher()
  }

  addNewConnection (ws) {
    const uniqueId = generateUniqueId() // TODO check collision?
    ws.uniqueId = uniqueId
    global.debug && console.log('ChatServer.addNewConnection:', uniqueId);

    let response = {
      type: messageTypesStr.get('MSG_TYPE_NEW_CONNECTION_RESULT'),
      uniqueId: uniqueId
    }

    this.uniqueIdSocketMap.set(uniqueId, ws)

    return response
  }

  closeConnection (ws) {
    const currentRoom = this.uniqueIdRoomMap.get(ws.uniqueId)
    global.debug && console.log('ChatServer.closeConnection:', ws.uniqueId);

    if (currentRoom != null) {
      currentRoom.removeUser(ws.uniqueId)
    }

    this.uniqueIdSocketMap.delete(ws.uniqueId)
    this.uniqueIdRoomMap.delete(ws.uniqueId)
  }

  async chatQueueFlusher () {
    let roomFlushQueue
    while (true) {
      if (this.roomFlushQueue.size > 0) {
        roomFlushQueue = this.roomFlushQueue
        this.roomFlushQueue = new Set()
      }
      await new Promise(resolve => setTimeout(resolve, 1000))
      if (roomFlushQueue != null && roomFlushQueue.size > 0) {
        this.flushChatQueue(roomFlushQueue)
      }
    }
  }

  flushChatQueue (roomFlushQueue) {
     try {
       for (let room of roomFlushQueue) {
         // TODO check getBufferedAmount?
         // TODO turn in promise, only do at most x rooms at a time, wait promises to resovle to keep going?
         room.flushChatMessageQueueToRecipients(this.uniqueIdSocketMap)
       }
     } catch (e) {
       global.debug && console.error('ChatServer.flushChatQueue error when flushing chat queue:', e)
     }
   }

  /* Incoming message handlers */

  handleIncomingMessage (message, payload, payloadOffset, ws) {
    let response = {}

    if (message.type == null) {
      return null
    }

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
      response = callback.call(this, message)
    } else {
      global.debug && console.warn('handleIncomingMessage: unknown message type, ignoring: ' + message.type)
    }

    return response
  }

  handleCreateRoom (message) {
    const response = {
      type: messageTypesStr.get('MSG_TYPE_CREATE_ROOM_RESULT'),
      uniqueId: message.uniqueId
    }

    const existingRoom = this.roomCodeMap.get(message.code)
    if (existingRoom != null) {
      response.success = false
      response.errorCode = errorsStr.get('ERROR_ROOM_ALREADY_EXISTS')
      response.errorMessage = 'Room ' + message.code + ' already exists'
      return response
    }

    const chatRoom = new ChatRoom(message.code)

    this.roomCodeMap.set(chatRoom.code, chatRoom)

    response.success = true
    return response
  }

  handleConnectRoom (message) {
    const response = {
      type: messageTypesStr.get('MSG_TYPE_CONNECT_ROOM_RESULT'),
      uniqueId: message.uniqueId
    }

    const existingRoom = this.roomCodeMap.get(message.code)
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

    this.uniqueIdRoomMap.set(message.uniqueId, existingRoom)
    existingRoom.addUser(message.uniqueId, message.userName, message.colorIndex)

    response.success = true
    return response
  }

  handleLeaveRoom (message) {
    const response = {
      type: messageTypesStr.get('MSG_TYPE_LEAVE_ROOM_RESULT'),
      uniqueId: message.uniqueId
    }

    const currentRoom = this.uniqueIdRoomMap.get(message.uniqueId)

    if (currentRoom != null) {
      currentRoom.removeUser(message.uniqueId)
    } else {
      response.success = false
      response.errorCode = errorsStr.get('ERROR_ROOM_NOT_IN_ANY_ROOM')
      response.errorMessage = 'UniqueId ' + message.uniqueId + ' not in any room'
      return response
    }

    response.success = true
    return response
  }

  handleSendChatMessage (message) {
    const response = {
      type: messageTypesStr.get('MSG_TYPE_SEND_CHAT_MESSAGE_RESULT'),
      uniqueId: message.uniqueId
    }

    const existingRoom = this.uniqueIdRoomMap.get(message.uniqueId)
    if (existingRoom == null) {
      response.success = false
      response.errorCode = errorsStr.get('ERROR_ROOM_DOES_NOT_EXISTS')
      response.errorMessage = 'Your uniqueId is not associated with any room'
      return response
    }

    existingRoom.addMessage(message.uniqueId, message, response)
    if (!response.success) {
      return response
    }

    this.roomFlushQueue.add(existingRoom)

    return response
  }
}
