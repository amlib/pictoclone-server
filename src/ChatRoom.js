import { ChatUser } from "./ChatUser.js";
import { messageTypesStr, messageTypesInt, errorsStr, errorsInt } from './enums.js'

export class ChatRoom {
  code
  maxSlots = 3
  uniqueIdUserMap = new Map() // 1234: ChatUser()
  userNameUserMap = new Map() // foobar: ChatUser()
  chatMessageQueue = []

  constructor(code) {
    this.code = code
  }

  checkFreeSlot () {
    return this.uniqueIdUserMap.size < this.maxSlots
  }

  checkFreeUserName (userName) {
    return this.userNameUserMap.get(userName) == null
  }

  addUser (uniqueId, userName, color) {
    const user = new ChatUser(userName, color)
    this.uniqueIdUserMap.set(uniqueId, user)
    this.userNameUserMap.set(userName, user)
  }

  addMessage (uniqueId, messagePayload) {
    // TODO Validate fields such as timestamp?
    this.chatMessageQueue.push({
      uniqueId: uniqueId,
      text: messagePayload.text,
      timestamp: messagePayload.timestamp
    })

    return true
  }

  flushChatMessageQueueToRecipients (uniqueIdSocketMap) {
    const chatMessageQueue = this.chatMessageQueue
    this.chatMessageQueue = []
    for (let i = 0; i < chatMessageQueue.length; ++i) {
      const message = chatMessageQueue[i]
      const user =  this.uniqueIdUserMap.get(message.uniqueId)
      message.userName = user.name
    }

    for (let [uniqueId, user] of this.uniqueIdUserMap) {
      const ws = uniqueIdSocketMap.get(uniqueId)
      const processedChatMessages = []
      for (let i = 0; i < chatMessageQueue.length; ++i) {
        const message = chatMessageQueue[i]
        if (uniqueId !== message.uniqueId) {
          processedChatMessages.push({
            text: message.text,
            timestamp: message.timestamp,
            userName: message.userName
          })
        }
      }

      // TODO dont send if processedChatMessages is empty
      const response = {
        type: messageTypesStr.get('MSG_TYPE_RECEIVE_CHAT_MESSAGES'),
        chatMessages: processedChatMessages
      }

      ws.send(JSON.stringify(response), false);
    }
  }
}
