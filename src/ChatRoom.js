import { ChatUser } from "./ChatUser.js";
import {
  messageTypesStr, messageTypesInt,
  errorsStr, errorsInt, encodeMessage
} from './specs.js'

export class ChatRoom {
  code
  maxSlots = 3
  uniqueIdUserMap = new Map() // 1234: ChatUser()
  userNameUserMap = new Map() // foobar: ChatUser()
  chatMessageQueue = [] // [ {...}, {...}, ...]

  constructor(code) {
    this.code = code
  }

  checkFreeSlot () {
    return this.uniqueIdUserMap.size < this.maxSlots
  }

  checkFreeUserName (userName) {
    return this.userNameUserMap.get(userName) == null
  }

  addUser (uniqueId, userName, colorIndex) {
    const user = new ChatUser(userName, colorIndex)
    this.uniqueIdUserMap.set(uniqueId, user)
    this.userNameUserMap.set(userName, user)
  }

  removeUser (uniqueId) {
    const user = this.uniqueIdUserMap.get(uniqueId)
    this.userNameUserMap.delete(user.name)
    this.uniqueIdUserMap.delete(uniqueId)
  }

  addMessage (uniqueId, message) {
    const user =  this.uniqueIdUserMap.get(uniqueId)

    this.chatMessageQueue.push({
      uniqueId: uniqueId, // Make sure uniqueId is never given to other users along with the message!
      text: message.text,
      timestamp: Date.now(), // ignoring received message timestamp...
      userName: user.name,
      colorIndex: user.colorIndex
    })

    return true
  }

  flushChatMessageQueueToRecipients (uniqueIdSocketMap) {
    const chatMessageQueue = this.chatMessageQueue
    this.chatMessageQueue = []
    // for (let i = 0; i < chatMessageQueue.length; ++i) {
    //   const message = chatMessageQueue[i]
    // }

    for (let [uniqueId, user] of this.uniqueIdUserMap) {
      const ws = uniqueIdSocketMap.get(uniqueId)
      const processedChatMessages = []
      for (let i = 0; i < chatMessageQueue.length; ++i) {
        const message = chatMessageQueue[i]
        if (uniqueId !== message.uniqueId) {
          processedChatMessages.push({
            text: message.text,
            timestamp: message.timestamp,
            userName: message.userName,
            colorIndex: message.colorIndex
          })
        }
      }

      if (processedChatMessages.length > 0) {
        if (processedChatMessages.length > 255) {
          console.error('flushChatMessageQueueToRecipients: too many messages! aborting!')
          return
        }
        const response = {
          type: messageTypesStr.get('MSG_TYPE_RECEIVE_CHAT_MESSAGES'),
          uniqueId: ws.uniqueId,
          chatMessages: processedChatMessages
        }

        ws.send(encodeMessage(response), true)
      }
    }
  }
}
