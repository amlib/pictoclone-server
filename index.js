import uWS from 'uWebSockets.js'
import { ChatServer } from './src/ChatServer.js'
import {
  messageTypesStr,
  errorsStr,
  decodeMessageHeader, encodeMessage
} from './src/specs.js'

const chatServer = new ChatServer()
const port = 9001

const app = uWS.App().ws('/*', {
  /* Options */
  compression: uWS.SHARED_COMPRESSOR,
  maxPayloadLength: 32 * 1024, // bytes
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
      console.log('message: ERROR:', e) // TODO only on debug
      const response = {
        type: messageTypesStr.get('MSG_TYPE_GENERIC_ERROR'),
        uniqueId: ws.uniqueId != null ? ws.uniqueId : 0,
        errorCode: errorsStr.get('ERROR_GENERIC_ERROR'),
        errorMessage: e.toString() // TODO only on debug
      }

      let ok = ws.send(encodeMessage(response), isBinary);
    }
  },
  drain: (ws) => {
    console.log('WebSocket backpressure: ' + ws.getBufferedAmount());
  },
  close: (ws, code, message) => {
    chatServer.closeConnection(ws)
    console.log('WebSocket closed', code, message);
  }
}).any('/*', (res, req) => {
  res.end('<>');
}).listen(port, (token) => {
  if (token) {
    console.log('Listening to port ' + port);
  } else {
    console.log('Failed to listen to port ' + port);
  }
});
