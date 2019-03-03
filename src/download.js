'use strict'

const net = require('net')
const Message = require('./utilities/Message')

const connectionRefusedPeers = []
const addressNotAvailedPeers = []
const connectionTimedOutPeers = []
const connectionResetPeers = []
class Download {
  constructor () {
    this.message = new Message()
  }
  chokeHandler () { return 0 }

  unchokeHandler () { return 0 }

  haveHandler (payload) { return 0 }

  bitfieldHandler (payload) { return 0 }

  pieceHandler (payload) { return 0 }

  onWholeMsg (socket, callback) {
    let savedBuf = Buffer.alloc(0)
    let msgHandShake = true
    socket.on('data', recvBuf => {
      const msgLen = () => msgHandShake ? recvBuf.readUInt8(0) + 49 : savedBuf.readUInt32BE(0) + 4
      savedBuf = Buffer.concat([savedBuf, recvBuf])
      while (savedBuf.length >= 4 && savedBuf.length >= msgLen()) {
        callback(savedBuf.slice(0, msgLen()))
        savedBuf = savedBuf.slice(msgLen())
        msgHandShake = false
      }
    })
  }
  messageHandler (msg, socket) {
    if (this.isHandshake(msg)) {
      socket.write(this.message.buildInterested())
    } else {
      const parsedMessage = this.message.parseMessage(msg)
      switch (parsedMessage.id) {
        case 0:
          this.chokeHandler()
          break
        case 1:
          this.unchokeHandler()
          break
        case 4:
          this.haveHandler(parsedMessage.payload)
          break
        case 5:
          this.bitfieldHandler(parsedMessage.payload)
          break
        case 7:
          this.pieceHandler(parsedMessage.payload)
          break
      }
    }
  }
  isHandshake (msg) {
    return msg.length === msg.readUInt8(0) + 49 && msg.toString('utf8', 1, 20) === 'BitTorrent protocol'
  }
  download (peer, torrentParser) {
    const socket = new net.Socket()
    socket.connect(peer.port, peer.ip, () => {
    })
    this.onWholeMsg(socket, msg => this.messageHandler(msg, socket))
    socket.on('error', error => {
      switch (error.code) {
        case 'ECONNREFUSED':
          connectionRefusedPeers.push(socket.address())
          break
        case 'ETIMEDOUT':
          connectionTimedOutPeers.push(socket.address())
          break
        case 'EADDRNOTAVAIL':
          addressNotAvailedPeers.push(socket.address())
          break
        case 'ECONNRESET':
          connectionResetPeers.push(socket.address())
          break
        default :
          console.error('this error happened:' + error.message +
         ', code: ' + error.code)
          break
      }
    })
    const bufferData = this.message.buildHandShake(torrentParser)
    socket.write(bufferData, () => {
    })
  }
}
module.exports = Download
