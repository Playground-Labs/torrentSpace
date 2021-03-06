'use strict'
import TorrentParser from './TorrentParser'
import uniqueClientId from './utilities/uniqueClientId'
import slices from './utilities/slices'

const dgram = require('dgram')
const url = require('url')
const crypto = require('crypto')

export default class Tracker {
  constructor (torrentFile, trackerURLs) {
    this.torrentFile = torrentFile
    this.trackerURLs = trackerURLs
    this.torrentParser = new TorrentParser(torrentFile)
  }
  getPeers (callback) {
    this.trackerURLs.forEach((individualTracker) => {
      const trackerURL = url.parse(individualTracker.toString('utf-8'))
      if (trackerURL.protocol === 'udp:') {
        const socket = dgram.createSocket('udp4')
        try {
          const messageData = this.buildConnectionRequest(socket, trackerURL)
          this.udpSend(messageData, 0)
        } catch (error) {
          console.error(error)
        }

        socket.on('error', (err) => {
          console.error(`server error:\n${err.stack}`)
          socket.close()
        })
        /*
        socket.on('listening', () => {
          const address = socket.address()
        })
        */
        socket.on('message', response => {
          switch (this.responseType(response)) {
            case 'connect':
              this.parseConnectionResponse(response)
                .then(ConnectionResponseData => this.buildAnnounceRequest(this.torrentFile, ConnectionResponseData.connectionId, socket, trackerURL))
                .then(messageData => this.udpSend(messageData, 0))
                .catch(error => console.error(error))
              break
            case 'announce':
              this.parseAnnounceResponse(response)
                .then(AnnounceResponseData => {
                  callback(AnnounceResponseData.peers, this.torrentParser)
                })
          }
        })
      }
    })
  }
  udpSend (messageData, offset, callback = () => {}) {
    messageData.socket.send(messageData.bufferData, offset, messageData.bufferData.length, messageData.trackerURL.port, messageData.trackerURL.hostname, () => {})
  }
  buildConnectionRequest (socket, trackerURL) {
    const bufferData = Buffer.allocUnsafe(16)
    bufferData.writeInt32BE(0x417, 0)
    bufferData.writeInt32BE(0x27101980, 4)
    bufferData.writeInt32BE(0, 8)
    crypto.randomBytes(4).copy(bufferData, 12)
    const messageData = {
      bufferData: bufferData,
      socket: socket,
      trackerURL: trackerURL
    }
    return messageData
  }
  responseType (response) {
    const action = response.readUInt32BE(0)
    switch (action) {
      case 0:
        return 'connect'
      case 1:
        return 'announce'
    }
    return response
  }
  async parseConnectionResponse (response) {
    return {
      action: response.readUInt32BE(0),
      transactionId: response.readUInt32BE(4),
      connectionId: response.slice(8)
    }
  }
  async buildAnnounceRequest (torrentFile, connectionId, socket, trackerURL, port = 6881) {
    const bufferData = Buffer.allocUnsafe(98)
    connectionId.copy(bufferData, 0)
    bufferData.writeUInt32BE(1, 8)
    crypto.randomBytes(4).copy(bufferData, 12)
    this.torrentParser.infoHash().copy(bufferData, 16)
    uniqueClientId.uniqueId().copy(bufferData, 36)
    Buffer.alloc(8).copy(bufferData, 56)
    this.torrentParser.torrentSize().copy(bufferData, 64)
    Buffer.alloc(8).copy(bufferData, 72)
    bufferData.writeUInt32BE(0, 80)
    bufferData.writeUInt32BE(0, 84)
    crypto.randomBytes(4).copy(bufferData, 88)
    bufferData.writeInt32BE(-1, 92)
    bufferData.writeUInt16BE(port, 96)
    const messageData = {
      bufferData: bufferData,
      socket: socket,
      trackerURL: trackerURL
    }
    return messageData
  }
  async parseAnnounceResponse (response) {
    return {
      action: response.readUInt32BE(0),
      transactionId: response.readUInt32BE(4),
      leechers: response.readUInt32BE(8),
      seeders: response.readUInt32BE(12),
      peers: slices.slicedParts(response.slice(20), 6).map(address => {
        return {
          ip: address.slice(0, 4).join('.'),
          port: address.readUInt16BE(4)
        }
      })
    }
  }
}
