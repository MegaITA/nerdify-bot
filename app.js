const { TelegramClient, Api } = require("telegram");
const { StringSession } = require("telegram/sessions");
const input = require("input");
const { NewMessage } = require("telegram/events");
const dotenv = require('dotenv').config();
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');

const apiId = process.env.API_ID;
const apiHash = process.env.API_HASH;
const session = new StringSession(process.env.SESSION || ""); // fill this later with the value from session.save()

(async () => {
    const client = new TelegramClient(session, apiId, apiHash, {
        connectionRetries: 5,
    });
    await client.start({
        phoneNumber: async () => await input.text("Please enter your number: "),
        password: async () => await input.text("Please enter your password: "),
        phoneCode: async () =>
            await input.text("Please enter the code you received: "),
        onError: (err) => console.log(err),
    });
    console.log("You should now be connected.");
    console.log(client.session.save()); // Save this string to avoid logging in again

    const db = await open({
        filename: './bot-db.db',
        driver: sqlite3.Database
    });

    await db.exec(`
        CREATE TABLE IF NOT EXISTS nerds (
            username TEXT NOT NULL UNIQUE
        );
    `);

    let nerds = {};

    let result = await db.all('SELECT * FROM nerds');
    for (const nerd of result) {
        nerds[nerd.username.toLowerCase()] = true;
    }

    let me = await client.getMe();
    console.log(`Logged in as ${me.firstName}`);

    let debounce = {};
    // Start the listener for messages

    client.addEventHandler(async (e) => {
        if (e.isPrivate && e.message.text.startsWith('!')) {
            console.log('LOG >> Received command', e.message.text);
            let [cmd, ...args] = e.message.text.split(' ');
            if (cmd == '!nerdify') {
                if (args.length < 1)
                    return await e.message.reply({message: 'Specify the username of the nerd.'});
                await db.run('INSERT INTO nerds (username) VALUES (:username)', { ':username': args[0].toLowerCase() });
                nerds[args[0]] = true;
                return await e.message.reply({message: `Nerd (${args[0]}) added to the bot.`});
            }
            if (cmd == '!unnerdify') {
                if (args.length < 1)
                    return await e.message.reply({message: 'Specify the username of the nerd.'});
                await db.run('DELETE FROM nerds WHERE username = :username', { ':username': args[0].toLowerCase() });
                nerds[args[0]] = undefined;
                return await e.message.reply({message: `Nerd (${args[0]}) removed from the bot.`});
            }
            return await e.message.reply({message: 'Unknown command'});
        }

        let senderUsername = await e.message.getSender()

        if(nerds[senderUsername.username?.toLowerCase()] && e.message.text.length > 0) {
            await client.invoke(new Api.messages.SendReaction({
                peer: e.message.chatId,
                reaction: [
                    new Api.ReactionEmoji({ emoticon: '🤓'} ),
                ],
                msgId: e.message.id
            }));            
            if (debounce[senderUsername.username.toLowerCase()])
                return
            if (e.message.text.length+5 > 4096)
                return
            await e.message.reply({message: '"' + e.message.text + '" ☝🏻🤓'});
            debounce[senderUsername.username.toLowerCase()] = true;
            setTimeout(() => { debounce[senderUsername.username.toLowerCase()] = false }, 1000);
        }

    }, new NewMessage({ }));

})();
