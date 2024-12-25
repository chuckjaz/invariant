import { Channel } from "./channel";

export class ChannelTopic<K, T> {
    key: K

    constructor (key: K) {
        this.key = key
    }
}

export class BroadcastChannel<K> {
    private channels = new Map<K, Channel<any>[]>

    topic<T>(key: K): ChannelTopic<K, T> {
        return new ChannelTopic<K, T>(key)
    }

    subscribe<T>(topic: ChannelTopic<K, T>): Channel<T> {
        let channels = this.channels.get(topic.key)
        if (!channels) {
            channels = []
            this.channels.set(topic.key, channels)
        }
        let channel = new Channel<T>()
        channels.push(channel)
        return channel
    }

    send<T>(topic: ChannelTopic<K, T>, message: T) {
        let channels = this.channels.get(topic.key)
        if (channels) {
            let someClosed = false
            for (const channel of channels) {
                if (!channel.closed) {
                    channel.send(message)
                } else {
                    someClosed = true
                }
            }
            if (someClosed) {
                this.channels.set(topic.key, channels.filter(c => !c.closed))
            }
        }
    }
}