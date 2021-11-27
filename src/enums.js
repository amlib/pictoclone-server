// each value in key value pair must be unique!
const messageTypesStr = new Map([
  ['MSG_TYPE_CREATE_ROOM', 0],
  ['MSG_TYPE_CONNECT_ROOM', 1],
  ['MSG_TYPE_SEND_CHAT_MESSAGE', 2],
  ['MSG_TYPE_CREATE_ROOM_RESULT', 3],
  ['MSG_TYPE_CONNECT_ROOM_RESULT', 4],
  ['MSG_TYPE_SEND_CHAT_MESSAGE_RESULT', 5],
  ['MSG_TYPE_NEW_CONNECTION_RESULT', 6],
  ['MSG_TYPE_GENERIC_ERROR', 7],
  ['MSG_TYPE_RECEIVE_CHAT_MESSAGES', 8]
])

const messageTypesInt = new Map([...messageTypesStr].map(x => [x[1], x[0]]))


export { messageTypesStr, messageTypesInt }
