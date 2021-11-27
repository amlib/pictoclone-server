import uWS from 'uWebSockets.js'
import { ChatServer } from './src/ChatServer.js'
import { messageTypesStr, messageTypesInt, errorsStr, errorsInt } from './src/enums.js'

const chatServer = new ChatServer()
const textDec = new TextDecoder("utf-8")
const textEnc = new TextEncoder("utf-8")
const port = 9001

const app = uWS.App().ws('/*', {
  /* Options */
  compression: uWS.SHARED_COMPRESSOR,
  maxPayloadLength: 32 * 1024, // bytes
  idleTimeout: 32,
  /* Handlers */
  open: (ws) => {
    const response = chatServer.addNewConnection(ws)
    let ok = ws.send(JSON.stringify(response), false);
  },
  message: (ws, payload, isBinary) => {
    const string = textDec.decode(new Uint8Array(payload))
    try {
      const message = JSON.parse(string)
      let response = chatServer.handleIncomingMessage(message, ws)

      /* Ok is false if backpressure was built up, wait for drain */
      if (response != null) {
        let ok = ws.send(JSON.stringify(response), isBinary);
      }
    } catch (e) {
      const response = {
        type: messageTypesStr.get('genericErrorResult'),
        errorCode: errorsStr.get('ERROR_GENERIC_ERROR'),
        errorMessage: e
      }
      let ok = ws.send(JSON.stringify(response), isBinary);
      throw e
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
