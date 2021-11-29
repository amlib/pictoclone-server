import { getPngDimensions } from "./Utils.js";
import { messageHeight, messageWidth } from "./Message.js";

import {
  messageTypesStr,
  errorsStr,
  maxImageSize,
  encodeMessage
} from './specs.js'

export class ChatRoom {
  code
  open
  maxSlots = 16
  topPublicId

  userNameUserSocketMap = new Map() // foobar: ws()
  attachedUsersSockets = new Set() // ws() ws() ...
  chatMessageQueue = [] // [ {...}, {...}, ...]

  constructor(code) {
    this.code = code
    this.open = true
    this.topPublicId = 0
  }

  checkFreeSlot () {
    return this.attachedUsersSockets.size < this.maxSlots
  }

  checkFreeUserName (userName) {
    return !this.userNameUserSocketMap.has(userName)
  }

  isEmpty () {
    return this.attachedUsersSockets.size <= 0
  }

  addUser (uniqueId, userName, colorIndex, ws) {
    this.topPublicId += 1
    this.userNameUserSocketMap.set(userName, ws)
    this.attachedUsersSockets.add(ws)

    ws.room = this
    ws.publicId = this.topPublicId
    ws.userName = userName
    ws.colorIndex = colorIndex
  }

  removeUser (ws) {
    this.userNameUserSocketMap.delete(ws.userName)
    this.attachedUsersSockets.delete(ws)

    ws.room = null
    ws.publicId = null
    ws.userName = null
    ws.colorIndex = null
  }

  addMessage (message, response, ws) {
    const dimensions = getPngDimensions(message.image)
    if (dimensions == null ||
      dimensions.length > messageWidth || dimensions.height > messageHeight ||
      message.image.byteLength > maxImageSize) {
      response.success = false
      response.errorCode = errorsStr.get('ERROR_CHAT_MESSAGE_INVALID_IMAGE')
      response.errorMessage = 'Invalid image'
      return
    }

    this.chatMessageQueue.push({
      publicId: ws.publicId,
      text: message.text, // TODO check texts size?
      image: message.image,
      timestamp: Date.now(), // ignoring received message timestamp...
      userName: ws.userName,
      colorIndex: ws.colorIndex
    })

    this.flushChatMessageQueueToRecipients()

    response.success = true
  }

  flushChatMessageQueueToRecipients () {
    return new Promise ((resolve) => {
      if (!this.open || this.chatMessageQueue == null || this.chatMessageQueue.length <= 0) {
        return
      }

      const chatMessageQueue = this.chatMessageQueue
      this.chatMessageQueue = []

      for (let ws of this.attachedUsersSockets) {

        const processedChatMessages = []
        for (let i = 0; i < chatMessageQueue.length; ++i) {
          const message = chatMessageQueue[i]
          if (ws.publicId !== message.publicId) {
            processedChatMessages.push(message)
          }
        }

        if (processedChatMessages.length > 0) {
          if (processedChatMessages.length > 255) {
            global.debug && console.warn('ChatRoom.flushChatMessageQueueToRecipients: too many messages! aborting!')
            continue
          }
          const response = {
            type: messageTypesStr.get('MSG_TYPE_RECEIVE_CHAT_MESSAGES'),
            uniqueId: ws.uniqueId,
            chatMessages: processedChatMessages
          }

          global.debug && console.log(`ChatRoom.flushChatMessageQueueToRecipients: dispatching from room ${this.code} to ${ws.userName} (${ws.uniqueId})`)
          ws.send(encodeMessage(response), true)
        }
      }
    })
  }
}
