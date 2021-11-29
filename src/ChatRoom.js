import { ChatUser } from "./ChatUser.js";
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

  uniqueIdUserMap = new Map() // 1234: ChatUser()
  userNameUniqueIdMap = new Map() // foobar: 1234
  chatMessageQueue = [] // [ {...}, {...}, ...]

  constructor(code) {
    this.code = code
    this.open = true
  }

  checkFreeSlot () {
    return this.uniqueIdUserMap.size < this.maxSlots
  }

  checkFreeUserName (userName) {
    return this.userNameUniqueIdMap.get(userName) == null
  }

  isEmpty () {
    return this.uniqueIdUserMap.size <= 0
  }

  addUser (uniqueId, userName, colorIndex) {
    const user = new ChatUser(userName, colorIndex)
    this.uniqueIdUserMap.set(uniqueId, user)
    this.userNameUniqueIdMap.set(userName, uniqueId)
  }

  removeUser (uniqueId) {
    const user = this.uniqueIdUserMap.get(uniqueId)
    this.userNameUniqueIdMap.delete(user.name)
    this.uniqueIdUserMap.delete(uniqueId)
  }

  addMessage (uniqueId, message, response) {
    const user =  this.uniqueIdUserMap.get(uniqueId)

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
      uniqueId: uniqueId, // Make sure uniqueId is never given to other users along with the message!
      text: message.text, // TODO check texts size?
      image: message.image,
      timestamp: Date.now(), // ignoring received message timestamp...
      userName: user.name,
      colorIndex: user.colorIndex
    })

    response.success = true
  }

  flushChatMessageQueueToRecipients (uniqueIdSocketMap) {
    if (!this.open || this.chatMessageQueue == null || this.chatMessageQueue.length <= 0) {
      return
    }

    const chatMessageQueue = this.chatMessageQueue
    this.chatMessageQueue = []
    // for (let i = 0; i < chatMessageQueue.length; ++i) {
    //   const message = chatMessageQueue[i]
    // }

    for (let [uniqueId, user] of this.uniqueIdUserMap) {
      const ws = uniqueIdSocketMap.get(uniqueId)
      if (ws == null) {
        continue
      }
      const processedChatMessages = []
      for (let i = 0; i < chatMessageQueue.length; ++i) {
        const message = chatMessageQueue[i]
        if (uniqueId !== message.uniqueId) {
          processedChatMessages.push({
            text: message.text,
            image: message.image,
            timestamp: message.timestamp,
            userName: message.userName,
            colorIndex: message.colorIndex
          })
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

        global.debug && console.log(`ChatRoom.flushChatMessageQueueToRecipients: dispatching from room ${this.code} to ${user.name} (${ws.uniqueId})`)
        ws.send(encodeMessage(response), true)
      }
    }
  }
}
