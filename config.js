const configs = {
  "production": {
    "port": 443,
    "debug": false,
    "ssl": true,
    "sslParams": {
      "key_file_name": "privkey.pem",
      "cert_file_name": "fullchain.pem"
    },
    "uwsParams": {}
  },
  "development": {
    "port": 9001,
    "debug": true,
    "ssl": false,
    "sslParams": {},
    "uwsParams": {}
  }
}

const generateConfig = function (uWS, name) {
  const uwsParams = {
    "compression": uWS.DISABLED,
    "maxPayloadLength": 32 * 1024,
    "maxBackpressure": 192 * 1024,
    "idleTimeout": 32
  }

  const config = configs[name]
  if (config == null) {
    return null
  }

  config.uwsParams = uwsParams

  return config
}

export { generateConfig }
