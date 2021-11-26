
export class ChatServer {
    constructor () {

    }

    handleIncomingMessage (message) {
        let response
        switch (message.type) {
            case "room":
                response = this.roomIncomingMessage(message)
                break;
        }

        return response
    }


    roomIncomingMessage (message) {
        return {
            type: 'room',
            code: message.code,
            connected: true
        }
    }
}


