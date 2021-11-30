import uWS from 'uWebSockets.js'
import { ChatServer } from './src/ChatServer.js'
import {
  messageTypesStr,
  errorsStr,
  decodeMessageHeader, encodeMessage
} from './src/specs.js'

const port = process.env.PC_PORT ? Number(process.env.PC_PORT) : 9001
global.debug = process.env.PC_DEBUG ? true : false

const chatServer = new ChatServer()

const app = uWS.App().ws('/*', {
  /* Options */
  compression: uWS.DISABLED,
  maxPayloadLength: 32 * 1024, // bytes
  maxBackpressure: 192 * 1024,
  idleTimeout: 32,
  /* Handlers */
  open: (ws) => {
    const response = chatServer.addNewConnection(ws)
    let ok = ws.send(encodeMessage(response), true)
  },
  message: (ws, payload, isBinary) => {
    try {
      const { message, payloadOffset } = decodeMessageHeader(payload)
      let response = chatServer.handleIncomingMessage(message, payload, payloadOffset, ws)

      if (response != null) {
        // Ok is false if backpressure was built up, wait for drain
        let ok = ws.send(encodeMessage(response), isBinary);
      }
    } catch (e) {
      global.debug && console.error('uWS.message: general error caught when processing a message:', e)
      const response = {
        type: messageTypesStr.get('MSG_TYPE_GENERIC_ERROR'),
        uniqueId: ws.uniqueId != null ? ws.uniqueId : 0,
        errorCode: errorsStr.get('ERROR_GENERIC_ERROR'),
        errorMessage: debug ? e.toString() : 'Generic error'
      }

      let ok = ws.send(encodeMessage(response), isBinary);
    }
  },
  drain: (ws) => {
    global.debug && console.log('uWS.drain WebSocket backpressure: ' + ws.getBufferedAmount());
  },
  close: (ws, code, message) => {
    chatServer.closeConnection(ws)
  }
}).any('/*', (res, req) => {
  res.end('<>');
}).listen(port, (token) => {
  if (token) {
    console.log('uWS.listen: Listening to port ' + port);
  } else {
    console.log('uWS.listen: Failed to listen to port ' + port);
  }
});
