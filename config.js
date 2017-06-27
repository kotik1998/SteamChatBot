var config = {
    account: [
        /*{
            username: "",
            password: ""
        }*//*,
        {
            username: "",
            password: ""
        }*/
    ],
    
    owner: '', // Steam ID 64-bit integer
    domain: "", // Only used to request a new key if you don't have a one already. Update to your own domain.
    group: '103582791458084036', // Group ID 64-bit integer, used for inviting people to your group //103582791458084036
    games: [
        
    ],
    admins: [
        '',
        '',
        ''
    ],
    cleverbot: {                                                                
        user: 'BXHCf5EtE2sLaPB8',                                               
        key: 'mw50zghuNSCrCwezQG06uSOYV4pkhLyn'                                 
    },
    chatTime: 259200 // time in seconds it takes when you dont recieve any commands to leave chat
};
module.exports = config;
