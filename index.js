// const uWS = require('uWebSockets.js')
import uWS from 'uWebSockets.js'
const port = 9001

import { ChatServer } from './src/ChatServer.js'
const chatServer = new ChatServer()
const textDec = new TextDecoder("utf-8")
const textEnc = new TextEncoder("utf-8")

const app = uWS.App().ws('/*', {
  /* Options */
  compression: uWS.SHARED_COMPRESSOR,
  maxPayloadLength: 16 * 1024 * 1024,
  idleTimeout: 10,
  /* Handlers */
  open: (ws) => {
    console.log('A WebSocket connected!');
  },
  message: (ws, payload, isBinary) => {
    const string = textDec.decode(new Uint8Array(payload))
    const message = JSON.parse(string)
    let response = chatServer.handleIncomingMessage(message)

    /* Ok is false if backpressure was built up, wait for drain */
    if (response != null) {
        let ok = ws.send(JSON.stringify(response), isBinary);
    }
  },
  drain: (ws) => {
    console.log('WebSocket backpressure: ' + ws.getBufferedAmount());
  },
  close: (ws, code, message) => {
    console.log('WebSocket closed');
  }
}).any('/*', (res, req) => {
  res.end('Nothing to see here!');
}).listen(port, (token) => {
  if (token) {
    console.log('Listening to port ' + port);
  } else {
    console.log('Failed to listen to port ' + port);
  }
});
