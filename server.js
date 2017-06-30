'use strict';
var Winston = require('winston');                               // Saving logs and displaying debug messages
var SteamUser = require('steam-user');                          // Steam client
var Community = require('steamcommunity');                      // Steam Community
var TradeOfferManager = require('steam-tradeoffer-manager');    // Steam tradeoffer manager
var got = require('got');
var cleverbot = require('cleverbot.io');                        // CleverBot
var fs = require('fs');                                         // Files System
var util = require('util');                                     // Util, not used atm, only for debuging
var mathjs = require('mathjs');                                 // Math.eval,simplify
var config = require('./config.js');                            // Config file, !!! change it to json !!!
if (config.cleverbot.user) {
    var bot = new cleverbot(config.cleverbot.user, config.cleverbot.key);
    bot.setNick('SteamNodeBotRoom');
    bot.create((err, session) => {
        if (err) {
            logger.error(`Error creating CleverBot session: ${err}`);
        } else {
            logger.debug(`Created CleverBot session: ${session}`);
        }
    });
}

var note = {}; // note object
var chats = {}; // chat settings object
var client = []; // Array of client objects
var chatInterval = {};
var BotID = [];

var questionAnswers = [
    'Yes',
    'No',
    'Probably',
    'Probably not',
    'Maybe',
    '100%',
    'I doubt it',
    'I don\'t know',
    'Unlikely',
    'Most likely',
    'Never'
];

var logger = new Winston.Logger({
    transports: [
        new Winston.transports.Console({
            colorize: true,
            level: 'debug'
        }),
        new Winston.transports.File({
            level: 'info',
            timestamp: true,
            filename: 'log.log',
            json: false
        })
    ]
});

// initialize clients

var initializeClients = (accounts) => {
    for (var i = 0; i < accounts.length; i++) {
        client.push( new initializeClient(accounts[i]));
    }
}

function initializeClient(login) {
    this.client = new SteamUser();
    this.community = new Community();
    this.manager = new TradeOfferManager({                            // Setup new Steam offermanager
        steam: this.client,                                     // Use Steam client
        domain: config.domain,                              // Domain
        language: 'en',                                       // English item desciptions
        pollInterval: 10000,                                      // Poll every 10s
        cancelTime: 300000                                      // Expire after 5 min
    });

// Event part of code

// Account
    this.client.on('loggedOn', (details) => {                            // on logged on
        logger.info(`[${login.username}] Logged into Steam as ${this.client.steamID.getSteam3RenderedID()}`);
        this.client.setPersona(SteamUser.EPersonaState.Online);      // Become online
        this.client.gamesPlayed(config.games);
    });

    this.client.on('error', (e) => {                                     // login error
        logger.error(`[${login.username}] ${e}`);
        process.exit(1);
    });

    this.client.on('webSession', (sessionID, cookies) => {               // Connected to Steam ommunity
        logger.debug(`[${login.username}] Got a web session.`);
        this.manager.setCookies(cookies, (err) => {
            if (err) {
                logger.error(`[${login.username}] Unable to set trade offer cookies: ${err}`);
                //process.exit(1);
            } else {
                logger.debug(`[${login.username}] Trade offer cookies set. Got API Key: ${this.manager.apiKey}`);
            }
        });
        this.community.setCookies(cookies, (err) => {
            if (err) {
                logger.error(`[${login.username}] ${err}`);
            } else {
                logger.debug(`[${login.username}] Steam Community cookies set`);
            }
        });
        /*for (var chat in this.client.myGroups) {
            if (!(chats.hasOwnProperty(chat) && chats[chat].hasOwnProperty('blocked')))
                this.client.joinChat(chat);
        }*/
    });

    this.client.on('emailInfo', (address, validated) => {                // Email changed
        logger.info(`[${login.username}] Our emails address is ${address} and it's ${(validated ? "validated" : "not validated")}`);
    });

    this.client.on('accountLimitations', (limited, communityBanned, locked, canInviteFriends) => {   // Looking for account limitations
        if (limited) {
            logger.warn(`[${login.username}] This account is limited! Can\'t send friend invites, use market, open group chat, or acces the web API.`);
        }
        if (communityBanned) {
            logger.warn(`[${login.username}] This account is banned from Steam Community!`);
        }
        if (locked) {
            logger.error(`[${this.client._logOnDetails.account_choosename}] This account is locked! Cannot trade/gift/purchase items, play on VAC servers or access Steam Community! Shutting down.`);
            process.exit(1);
        }
        if (!canInviteFriends) {
            logger.warn(`[${login.username}] This account is unable to send friend requests!`);
        }
    });

// Friends
    // Invited to group chat
    this.client.on('chatInvite', (inviterID, chatID, chatName) => {      

        if (chats.hasOwnProperty(chatID) && chats[chatID].hasOwnProperty('blocked'))
            return;
        if (chats.commandStatus.joinchat) {
            this.client.joinChat(chatID);
            logger.info(`[${login.username}] Invited to chat : ${chatName} (${chatID})`);
        }
    }); //done

    // Entered group chat
    this.client.on('chatEnter', (chatID, response) => {

        for (var i in steamIDs) {
            if (this.chats[chatID].members.hasOwnProperty(i))
                this.client.leaveChat(chatID);
        }

        if (chats.hasOwnProperty(chatID)) {
            this.client.chatMessage(chatID, 'Hi!');
            if (!(chatInterval.hasOwnProperty(chatID)))
                chatInterval[chatID] = setInterval(() => { this.GroupTimer(chatID) }, 7200000);

        } else {
            this.client.chatMessage(chatID, 'Hi! This is first time i was invited to this chat!\nIf you need any help use /help\nIf somebody invted me to your group and you dont want any bots in your group ask mod or admin to use /leavechat and/or /leavegroup (admin only) or i will just leave when i dont recieve any command for 48 hours');
            chats[chatID] = new ChatProperties();
            //chatInterval[chatID] = setInterval(() => { this.GroupTimer(chatID) }, 7200000); //7200000
            fs.writeFile('chats.json', JSON.stringify(chats).replace(/[\u007F-\uFFFF]/g, (chr) => {
                return "\\u" + ("0000" + chr.charCodeAt(0).toString(16)).substr(-4)
            }), (err) => {
                if (err) {
                    logger.error(err);
                }
            });
        }

        logger.debug(`[${login.username}] Joined Chat: ${chatID}`);
    }); //done

    this.client.on('chatMessage', (chatID, userID, message) => {
        var userID64 = userID.getSteamID64();

        if (message.startsWith('/')) {

            if (!(chats.hasOwnProperty(chatID))) {
                logger.warn(`#{[login.username] Didn't find chatID in chats: ${this.client.chats[chatID].name} ${chatID}`);

                this.client.chatMessage(chatID, 'Oh no! Some kind of error, attepting to rejoin this chat');

                this.client.leaveChat(chatID);
                this.client.joinChat(chatID);
                return;
            }

            if (!(this.client.chats[chatID].members[userID64].hasOwnProperty('permissionLevel')))
                switch (this.client.chats[chatID].members[userID64].rank) {
                    case 4:
                        this.client.chats[chatID].members[userID64].permissionLevel = 1
                        break;
                    case 8:
                        this.client.chats[chatID].members[userID64].permissionLevel = 2
                        break;
                    case 2:
                        this.client.chats[chatID].members[userID64].permissionLevel = 3
                        break;
                    case 1:
                        this.client.chats[chatID].members[userID64].permissionLevel = 4
                        break;
                    default:
                        this.client.chats[chatID].members[userID64].permissionLevel = 0
                }

            if (!(this.client.chats[chatID].hasOwnProperty('permissionLevel')))
                switch (this.client.chats[chatID].members[this.client.steamID].rank) {
                    case 4:
                        this.client.chats[chatID].permissionLevel = 1
                        break;
                    case 8:
                        this.client.chats[chatID].permissionLevel = 2
                        break;
                    case 2:
                        this.client.chats[chatID].permissionLevel = 3
                        break;
                    case 1:
                        this.client.chats[chatID].permissionLevel = 4
                        break;
                    default:
                        this.client.chats[chatID].permissionLevel = 0
                }
            
            if (config.owner === userID64)
                this.client.chats[chatID].members[userID64].permissionLevel = 6
            else if (config.admins.includes(userID64))
                this.client.chats[chatID].members[userID64].permissionLevel = 5
            var senderRank = this.client.chats[chatID].members[userID64].permissionLevel;
            var myRank = this.client.chats[chatID].permissionLevel;
        //admin and owner
            if (senderRank > 4) {
                if (message.startsWith('/debug') && senderRank === 6) {
                    console.log(util.inspect(this.client.chats[chatID], true, null, true));
                } else if (message.startsWith('/toggle ')) {
                    message = message.substring(8);
                    if (chats.hasOwnProperty(message)) {
                        chats[message] = !chats[message];
                    }
                } else if (message === '/whoami' && senderRank === 6) {
                    this.client.chatMessage(chatID, 'Mah master');
                }
            }
        
        //q
            if (message.toLowerCase().startsWith('/q ') && chats[chatID].commandStatus.question) {

                if (!(this.CheckPermissionCommand(chatID, 'question', senderRank)))
                    return;
                if (!(this.CheckTimeCommand(chatID, 'question')))
                    return;
                this.ResetTimer(chatID, 'question');

                logger.info(`[${login.username}] Recieved "/q" command. user: ${this.client.users[userID64].player_name} (${userID64})`);

                this.client.chatMessage(chatID, questionAnswers[Math.floor(Math.random() * questionAnswers.length)]);
        //note
            } else if (message.toLowerCase().startsWith('/note') && chats[chatID].commandStatus.note) {

                if (!(this.CheckPermissionCommand(chatID, 'note', senderRank)))
                    return;
                if (!(this.CheckTimeCommand(chatID, 'note')))
                    return;
                this.ResetTimer(chatID, 'note');

                logger.info(`[${login.username}] Recieved "/note" (${message}) command. user: ${this.client.users[userID64].player_name} (${userID64})`);

                var noteArray = [];
                noteArray = message.match(/^\/note ?(\S*) ?((.|\n)*)/i);

                if (noteArray[2]) {
                    if (!(message.includes('youtu') || !(noteArray[2].match(/(http:\/\/|https:\/\/)?(www\.)?(\S+?)\.((\S)+)/i))) || noteArray[2].toLowerCase().startsWith('/set') || noteArray[2].toLowerCase().startsWith('/note')) {

                    } else {
                        note[noteArray[1]] = noteArray[2];

                        fs.writeFile('Notes.json', JSON.stringify(note).replace(/[\u007F-\uFFFF]/g, (chr) => {
                            return "\\u" + ("0000" + chr.charCodeAt(0).toString(16)).substr(-4)
                        }), (err) => {
                            if (err) {
                                logger.error(`[${login.username}] ${err}`);
                            }

                            this.client.chatMessage(chatID, 'Note set!');
                        });
                    }

                } else if (noteArray[1]) {

                    if (note.hasOwnProperty(noteArray[1].toLowerCase())) {
                        this.client.chatMessage(chatID, note[noteArray[1].toLowerCase()]);
                    } else {
                        this.client.chatMessage(chatID, 'Note doesn\'t exist!');
                    }

                } else {

                    this.client.chatMessage(chatID, 'Syntax error: /note <name> [value]');

                }
        //random
            } else if (message.toLowerCase().startsWith('/random') && chats[chatID].commandStatus.random) {

                if (!(this.CheckPermissionCommand(chatID, 'random', senderRank)))
                    return;
                if (!(this.CheckTimeCommand(chatID, 'random')))
                    return;
                this.ResetTimer(chatID, 'random');

                logger.info(`[${login.username}] Recieved "/random" command. user: ${this.client.users[userID].player_name} (${userID})`);

                var membersInChat = this.client.chats[chatID].members;
                var randomPlayer = Math.floor(Math.random() * Object.keys(membersInChat).length);
                var winner = this.client.users[Object.keys(membersInChat)[randomPlayer]].player_name;
                this.client.chatMessage(chatID, `The winner is ${winner}`);

        //choose
            } else if (message.toLowerCase().startsWith('/choose') && chats[chatID].commandStatus.choose) {
                
                if (!(this.CheckPermissionCommand(chatID, 'choose', senderRank)))
                    return;
                if (!(this.CheckTimeCommand(chatID, 'choose')))
                    return;
                this.ResetTimer(chatID, 'choose');

                var items = message.match(/^\/choose(( \S+){2,})/i);
                if (items) {

                    var choiceList = items[1].split(' ');
                    choiceList.shift();
                    var choice = choiceList[Math.floor(Math.random() * (choiceList.length))];
                    this.client.chatMessage(chatID, `I choose ${choice}`);
                    logger.info(`[${login.username}] Recieved "/choose" command. user: ${this.client.users[userID].player_name} (${userID})`);

                } else {

                    this.client.chatMessage(chatID, 'I don\'t think you understand how this works.');

                }
            
        //define
            } else if (message.toLowerCase().startsWith('/define ') && chats[chatID].commandStatus.define) {

                if (!(this.CheckPermissionCommand(chatID, 'define', senderRank)))
                    return;
                if (!(this.CheckTimeCommand(chatID, 'define')))
                    return;
                this.ResetTimer(chatID, 'define');

                logger.info(`[${login.username}] Recieved "/define" (${message}) command. user: ${this.client.users[userID].player_name} (${userID})`);

                var word = message.substring(8);

                got(`http://api.urbandictionary.com/v0/define?term=${word}`).then(response => {

                    var definition = JSON.parse(response.body);
                    if (definition.result_type === 'exact') {
                        this.client.chatMessage(chatID, `${definition.list[0].word}.: ${definition.list[0].definition}`);
                    } else {
                        this.client.chatMessage(chatID, 'Definition not found.');
                    }
                }).catch(
                    logger.info(`[$login.username] /define error: ${error.response.body}`));

        //"Clever"bot
            } else if (message.toLowerCase().startsWith('/b ') && chats[chatID].commandStatus.bot) {

                if (!(this.CheckPermissionCommand(chatID, 'bot', senderRank)))
                    return;
                if (!(this.CheckTimeCommand(chatID, 'bot')))
                    return;
                this.ResetTimer(chatID, 'bot');

                bot.ask(message.substring(3), (err, response) => {
                    if (err) {
                        logger.error(`[${login.username}] ${err}`);
                    } else {

                        logger.info(`[${login.username}] Recieved /b command (${message}) command. user: ${this.client.users[userID64].player_name} (${userID64})`);

                        this.client.chatMessage(chatID, response);
                    }
                });

        //hug
            } else if (message.toLowerCase().startsWith('/hug') && chats[chatID].commandStatus.hug) {

                if (!(this.CheckPermissionCommand(chatID, 'hug', senderRank)))
                    return;
                if (!(this.CheckTimeCommand(chatID, 'hug')))
                    return;
                this.ResetTimer(chatID, 'hug');

                logger.info(`[${login.username}] Recieved "/hug" command. user: ${this.client.users[userID64].player_name} (${userID64})`);

                this.client.chatMessage(chatID, `*Hugs ${this.client.users[userID64].player_name} <3*`);
        //slap
            } else if (message.toLowerCase().startsWith('/slap') && chats[chatID].commandStatus.slap) {

                if (!(this.CheckPermissionCommand(chatID, 'slap', senderRank)))
                    return;
                if (!(this.CheckTimeCommand(chatID, 'slap')))
                    return;
                this.ResetTimer(chatID, 'slap');

                logger.info(`[${login.username}] Recieved "/slap" command. user: ${this.client.users[userID64].player_name} (${userID64})`);

                var target = message.match(/^\/slaps? (.+)/i);

                if (target) {
                    this.client.chatMessage(chatID, `*Slaps ${target[1]}*`);
                } else {
                    this.client.chatMessage(chatID, `*Slaps ${this.client.users[userID64].player_name}*`);
                }

        //add
            } else if (message.toLowerCase() === '/add' && chats.commandStatus.add) {

                this.client.addFriend(userID, (err, name) => {
                    if (err) {
                        if (err) {
                            this.client.chatMessage(chatID, `${this.client.users[userID64].player_name} you are already in my friends list.`); //name doesnt work here
                        } else {
                            logger.error(`[${login.username}] ${err}`);
                        }
                    } else {

                        logger.info(`[${login.username}] recieved "/add" command ${name} (${userID64})`);

                        this.client.chatMessage(chatID, `Added ${name} to my friend list`);
                    }

                });

        //group
            } else if (message.toLowerCase() === '/group' && chats.commandStatus.group) {

                logger.info(`[${login.username}] recieved "/group" command ${this.client.users[userID64].player_name} (${userID64})`);

                this.client.inviteToGroup(userID64, config.group);
                

        //status
            } else if (message.startsWith('/status') && chats[chatID].commandStatus.status) {
                
                if (!(this.CheckPermissionCommand(chatID, 'status', senderRank)))
                    return;
                if (!(this.CheckTimeCommand(chatID, 'status')))
                    return;
                this.ResetTimer(chatID, 'status');

                var message = '\n';
                for (var i in chats[chatID].commandStatus) {
                    var anothertab = i === 'simplify' ? '\t' : '';
                    var status = chats[chatID].commandStatus[i] ? 'On' : 'Off';
                    
                    var rank = '';
                    switch (chats[chatID].commandPermission[i]) {
                        case 0:
                            rank = 'Everyone '
                            break;
                        case 1:
                            rank = 'Members  '
                            break;
                        case 2:
                            rank = 'Moderators'
                            break;
                        case 3:
                            rank = 'Officers '
                            break;
                        case 4:
                            rank = 'Group owner'
                            break;
                        case 5:
                            rank = 'Bot admins'
                            break;
                        case 6:
                            rank = 'Bot owner'
                            break;
                        default:
                            rank = ''
                    }
                    var delay = chats[chatID].commandDelay.hasOwnProperty(i) ? chats[chatID].commandDelay[i] : 0;

                    message += `${i}:${anothertab}${i.length < 7 ? '\t' : ''}\t${status}\t${rank}${rank.length < 7 ? '\t' : ''}\t${delay !== 0 ? `${delay}s` : ''}\n`;
                }
                this.client.chatMessage(chatID, message);

        //help
            } else if (message.startsWith('/help') && chats[chatID].commandStatus.help) {

                if (!(this.CheckPermissionCommand(chatID, 'help', senderRank)))
                    return;
                if (!(this.CheckTimeCommand(chatID, 'help')))
                    return;
                this.ResetTimer(chatID, 'help');

                this.client.chatMessage(chatID, '\n/help - displays this message\n/add - add me to friends\n/b [message] - talk to me : ^)\n/choose [word] [word]...\n/define [word] - ask for definition\n/group - get invite to Yaoi bot group\n/hug - hugs : ^)\n/kick [user] - kick user (use /set command to change permissions)\n/lock and /unlock - lock chatroom (or unlock it, you can also use /lock to unlock chatroom)\n/math [the math]\n/note [name] <value> sets a note for [name]\n/q [question] - answers yes/no/maybe/etc\n/random - chooses random user in chat\n/randnum [number] - generates random number from 0 to [number]\n/slap <user> - slaps you or <user>\n/set [] [] [] allows for bot configuration - visit http://steamcommunity.com/groups/YaoiBot/discussions/0/1353742967809927087/ for more info!\n/status - displays command status permissions and anti spam  delay\n/votekick and /voteleave will be added soon :  ^)');

        //leavegroup
            } else if (message.toLowerCase() === '/leavegroup') {

                if (!(this.CheckPermissionCommand(chatID, 'leavegroup', senderRank)))
                    return;

                logger.info(`[${login.username}] Left Group: ${this.client.chats[chatID].name} (${chatID})`);
                this.community.leaveGroup(chatID);

        //leavechat
            } else if (message.toLowerCase() === '/leavechat') {

                if (!(this.CheckPermissionCommand(chatID, 'leavechat', senderRank)))
                    return;

                this.client.chatMessage(chatID, 'Bye!');
                logger.info(`[${login.username}] Left Chat: ${this.client.chats[chatID].name} (${chatID})`);
                this.client.leaveChat(chatID);

        //set, to optimize
            } else if (message.toLowerCase().startsWith('/set')) {

                if (!(this.CheckPermissionCommand(chatID, 'set', senderRank)))
                    return;
                this.ResetGroupTimerOnly(chatID);

                logger.info(`[${login.username}] Recieved '/set' command (${message}) from user: ${this.client.users[userID].player_name} (${userID})`);
                if (message.toLowerCase().startsWith('/set ')) {
                    message = message.substring(5);
                    if (message.toLowerCase().startsWith('status ')) {
                        message = message.toLowerCase().substring(7);
                        if (!(message.includes(' ')))
                            return;
                        var command = message.split(' ');
                        if (chats[chatID].commandStatus.hasOwnProperty(command[0])) {
                            switch (command[1]) {
                                case ('on'):
                                    chats[chatID].commandStatus[command[0]] = true;
                                    return;
                                case ('off'):
                                    chats[chatID].commandStatus[command[0]] = false;
                                    return;
                            }
                        }
                    } else if (message.toLowerCase().startsWith('permission ')) {
                        message = message.substring(11);
                        if (!(message.includes(' ')))
                            return;
                        var command = message.split(' ');
                        if (chats[chatID].commandPermission.hasOwnProperty(command[0])) {
                            var value = command[1].match(/\d+/);
                            if (value && value >= 0 && value <= 6) {
                                if (command[0] === 'set' && value >= 2 && value <= 4)
                                    chats[chatID].commandDelay[command[0]] = value;

                                else if (command[0] !== 'set')
                                    chats[chatID].commandDelay[command[0]] = value;
                                return;
                            }
                        }
                    } else if (message.toLowerCase().startsWith('delay ')) {
                        message = message.toLowerCase().substring(6);
                        if (!(message.includes(' ')))
                            return;
                        var command = message.split(' ');
                        if (chats[chatID].commandDelay.hasOwnProperty(command[0])) {
                            var value = command[1].match(/\d+/);
                            if (value) {
                                chats[chatID].commandDelay[command[0]] = value;
                                return;
                            }
                        }
                    } else if (message.toLowerCase().startsWith('greeting ')) {
                        message = message.substring(9);
                        chats[chatID].greeting = message;
                    } else if (message.toLowerCase().startsWith('valediction ')) {
                        message = message.substring(12);
                        chats[chatID].valediction = message;
                    }
                    this.client.chatMessage(chatID, 'If you have any problem configuring the bot visit: http://steamcommunity.com/groups/YaoiBot/discussions/0/1353742967809927087/');
                }
                fs.writeFile('chats.json', JSON.stringify(chats).replace(/[\u007F-\uFFFF]/g, (chr) => {
                    return "\\u" + ("0000" + chr.charCodeAt(0).toString(16)).substr(-4)
                }), (err) => {
                    if (err) {
                        logger.error(err);
                    }
                });

        //kick
            } else if (message.toLowerCase().startsWith('/kick ') && (chats[chatID].commandStatus.kick)) {
            
                if (!(this.CheckPermissionCommand(chatID, 'kick', senderRank)))
                    return;
                if (!(this.CheckTimeCommand(chatID, 'kick')))
                    return;
                this.ResetTimer(chatID, 'kick');

                message = message.substring(6);
                for (var user in this.client.chats[chatID].members) {
                    if (this.client.users[user].player_name === message) {

                        this.client.kickFromChat(chatID, user);
                        logger.info(`[${login.username}] Kicked user: ${this.client.users[user].player_name} (${user}) from chat: ${this.client.chats[chatID].name} (${chatID})`);
                        return;
                    } 
                }
                this.client.chatMessage(chatID, 'User not found!');
        //report
            } else if (message.toLowerCase().startsWith('/report ') && chats.commandStatus.report) {
                message = message.substr(8);
                this.client.chatMessage(config.owner, `${chatID} ${message}`);
        //math
            } else if (message.toLowerCase().startsWith('/math ') && chats[chatID].commandStatus.math) {

                if (!(this.CheckPermissionCommand(chatID, 'math', senderRank)))
                    return;
                if (!(this.CheckTimeCommand(chatID, 'math')))
                    return;
                this.ResetTimer(chatID, 'math');

                logger.info(`[${login.username}] Recieved /math command (${message}), user: ${this.client.users[userID64].player_name} (${userID64})`);
                
                message = message.substring(6);

                if (message.includes(/[!:(range)]/i))
		            return;
		
                var result = '';
                try {
                    var result = mathjs.eval(message).toString();
                } catch (e) {
                    var result = 'Are you sure you entered everything correctly?';
                }
                this.client.chatMessage(chatID, result);
	    //randnum
            } else if (message.toLowerCase().startsWith('/randnum ') && chats[chatID].commandStatus.randnum) {

                if (!(this.CheckPermissionCommand(chatID, 'randnum', senderRank)))
                    return;
                if (!(this.CheckTimeCommand(chatID, 'randnum')))
                    return;
                this.ResetTimer(chatID, 'randnum');

                logger.info(`[${login.username}] Recieved /randnum command, user: ${this.client.users[userID64].player_name} (${userID64})`);

                var number = message.match(/\/randnum (\d+)/i);
                if (number) {
                    var number = Math.floor(Math.random() * parseInt(number[1]));
                    this.client.chatMessage(chatID, number.toString());
                }
	    //lock
            } else if (message.toLowerCase() === '/lock' && chats[chatID].commandStatus.lock) {

                if (!(this.CheckPermissionCommand(chatID, 'lock', senderRank)))
                    return;
                this.ResetGroupTimerOnly(chatID);


                if (this.client.chats[chatID].private) {
                    this.client.setChatPublic(chatID);
                } else {
                    this.client.setChatPrivate(chatID);
                }
	    //unlock
            } else if (message.toLowerCase() === '/unlock' && chats[chatID].commandStatus.lock) {

                if (!(this.CheckPermissionCommand(chatID, 'lock', senderRank)))
                    return;
                this.ResetGroupTimerOnly(chatID);

                this.client.setChatPublic(chatID);
            }

        } else {
        //youtube
            if ((message.toLowerCase().includes('https://youtu.be/') || message.toLowerCase().includes('www.youtube.com/watch?v=')) && chats[chatID].commandStatus.youtube) {
                var link = message.match(/(https:\/\/youtu.be\/|https?:\/\/www.youtube.com\/watch\?v=)\S+/i);
                got(link[0]).then(response => {
                    var title = response.body.match(/<title>(.*?)<\/title>/);
                    this.client.chatMessage(chatID, title[1]);
                }).catch(error => {
                    logger.error(`[${login.username}] ${error.response.body}`);
                });
            }
        }
    });

    this.client.on('chatUserJoined', (chatID, userID) => {

        if (chats[chatID].commandStatus.greeting) {
            this.client.chatMessage(chatID, `${chats[chatID].greeting} ${this.client.users[userID].player_name}!`);
        }
    }); //done

    this.client.on('chatUserLeft', (chatID, userID) => {
        if (chats.hasOwnProperty(chatID) && chats[chatID].commandStatus.valediction) {

            this.client.chatMessage(chatID, `${chats[chatID].valediction} ${this.client.users[userID].player_name}!`);
        };
    }); //done

    this.client.on(`friendOrChatMessage#${config.owner}`, (userID, message, chatID) => {

        if (message.startsWith('/')) {
            if (message.startsWith('/changename')) {
                var name = message.match(/^\/changename (.+)/i)[1];
                logger.info(`[${login.username}] Changing name to: '${name}'`);
                this.client.setPersona(SteamUser.EPersonaState.Online, name);
            } else if (message === '/leaveallchats') {

                for (var chat in this.client.chats) {
                    this.client.leaveChat(chatID);
                }
            } else if (message === '/leaveallgroups') {

                for (var chat in this.client.chats) {
                    this.client.community(chatID);
                }
            }
        }
    });

    this.client.on('groupRelationship', (groupID, relationship) => {

        if (relationship === SteamUser.EClanRelationship.Invited && chats.commandStatus.joingroup) {
            logger.info(`[${login.username}] Added to gorup: ${groupID}`);
            this.client.respondToGroupInvite(groupID, true); // change to variable and toggle
            this.client.joinChat(groupID);
        } else if (relationship === SteamUser.EClanRelationship.Kicked) {
            logger.info(`[${login.username}] Kicked from gorup: ${groupID}`);
        }

        if (this.client.myGroups.length > 900) {

        }
    });

    this.client.on('newComments', () => {

    });

// Trading
    this.client.on('wallet', (hasWallet, currency, balance) => {         // Checks if wallet exists
        if (hasWallet) {
            logger.info(`[${login.username}] We have ${SteamUser.formatCurrency(balance, currency)} Steam wallet remaining`);
        } else {
            logger.info(`[${login.username}] We don\'t have a Steam wallet.`);
        }
    });

    this.client.on('newItems', (count) => {                              // Recieved new items
        logger.info(`[${login.username}] ${count} new items in our inventory`);
    });

    this.manager.on('Polldata', (pollData) => {
        fs.writeFile(`Polldata${login.username}.json`, JSON.stringify(pollData));
    });

    this.manager.on('pollFailure', (err) => {
        logger.error(`[${login.username}] Error polling for trade offers: ${err}`);
    });

    this.manager.on('newOffer', (offer) => {
        logger.info(`[${login.username}] New offer #${offer.id} from ${offer.partner.getSteam3RenderedID()}`);
        if (offer.partner.getSteamID64() === config.owner) {
            offer.accept((err) => {
                if (err) {
                    logger.error(`[${login.username}] Unable to accept offer ${offer.id}: ${err.message}`);
                } else {
                    logger.info(`[${login.username}] Offer accepted ${offer.id}.`);
                }
            });
        }
    });
// Other
    

    fs.readFile(`Polldata${login.username}.json`, (err, data) => {                   // Save polldata for later sessions if crashed or something idk
        if (err) {
            logger.warn(`[${login.username}] Error reading Polldata.json. If this is the first run, this is expected behavior: ${err}`);
        } else {
            logger.debug(`[${login.username}] Found previous trade offer poll data. Importing it to keep running smoothly.`);
            this.manager.pollData = JSON.parse(data);
        }
    });


    this.CheckPermissionCommand = (chatID, command, senderRank) => {
        if (chats[chatID].commandPermission[command] <= senderRank)
            return true;
        return false;
    }

    this.CheckTimeCommand = (chatID, command) => {
        var time = new Date();
        if (time.getTime() - chats[chatID].commandLastTime[command] > chats[chatID].commandDelay[command] * 1000 || chats[chatID].commandLastTime[command] === 0)
            return true;
        return false;
    }

    /*this.GroupTimer = (chatID) => {
        var time = new Date();


        if (!(this.client.chats.hasOwnProperty(chatID)))
            return;

        if (time.getTime() - chats[chatID].lastCommandTime > config.chatTime * 1000) {
            if (this.client.chats.hasOwnProperty(chatID) && this.client.chats[chatID].hasOwnProperty('permissionLevel') && this.client.chats[chatID].permissionLevel > 1)
                return;

            clearInterval(chatInterval[chatID]);
            this.client.leaveChat(chatID);
            this.community.leaveGroup(chatID);
            delete chats[chatID];
            delete chatInterval[chatID];
        }
    }*/

    this.CheckGroupCount = () => {


    }

    this.ResetTimer = (chatID, command) => {
        var time = new Date();
        chats[chatID].commandLastTime[command] = time.getTime();
        chats[chatID].lastCommandTime = time.getTime();
    }

    this.ResetGroupTimerOnly = (chatID) => {
        var time = new Date();
        chats[chatID].lastCommandTime = time.getTime();
    }

// Login
    this.client.logOn({
        accountName: login.username,
        password: login.password
    });
}

fs.readFile('Notes.json', (err, data) => {
    if (err) {
        logger.error(`Error reading notes file: ${err}`);
        note = {};
    }
    note = JSON.parse(data);
});

fs.readFile('chats.json', (err, data) => {
    if (err) {
        logger.error(`Error reading chat settings file: ${err}`);

        chats = {};
        chats.commandStatus = {
            add: true,
            group: true,
            joingroup: true,
            joinchat: true,
            report: true
        };
    } else {
        chats = JSON.parse(data);
        
    }
});

initializeClients(config.account);

function ChatProperties() {
    this.commandStatus = {
        bot: true,
        choose: true,
        define: true,
        greeting: true,
        help: true,
        hug: true,
        kick: true,
        lock: true,
        math: true,
        note: true,
        question: true,
        randnum: true,
        random: true,
        slap: true,
        status: true,
        valediction: true,
        votekick: true,
        voteleave: true,
        youtube: true
    };
    this.commandPermission = {
        bot: 1,
        choose: 1,
        define: 1,
        help: 0,
        hug: 1,
        kick: 2,
        leavechat: 2,
        leavegroup: 3,
        lock: 2,
        math: 2,
        note: 1,
        question: 1,
        randnum: 1,
        random: 2,
        set: 3,
        slap: 2,
        status: 1,
        votekick: 1,
        voteleave: 1
    };
    this.commandDelay = {
        bot: 1,
        choose: 5,
        define: 5,
        help: 20,
        hug: 1,
        kick: 5,
        math: 5,
        note: 10,
        question: 5,
        randnum: 5,
        random: 3,
        slap: 10,
        status: 30
    };
    this.commandLastTime = {
        bot: 0,
        choose: 0,
        define: 0,
        help: 0,
        hug: 0,
        kick: 0,
        math: 0,
        note: 0,
        question: 0,
        randnum: 0,
        random: 0,
        slap: 0,
        status: 0
    };
    this.greeting = 'Hi';
    this.valediction = 'Bye';
    this.lastCommandTime = 0;
}
//} catch (e) {
// }

//add vote kick
