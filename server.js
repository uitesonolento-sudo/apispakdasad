const http = require('http');
const url = require('url');
require('dotenv').config();
const fetch = require('node-fetch');
const { checkValidSnowflake, snowflakeToDate } = require('./utils');
const { USER_FLAGS, APPLICATION_FLAGS } = require('./Constants');

const PORT = process.env.API_PORT || 3000;

const sendJSON = (res, status, data) => {
    res.writeHead(status, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,PUT,POST,DELETE',
        'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end(JSON.stringify(data));
};

const handleGuild = async (req, res, id) => {
    if (isNaN(id)) {
        return sendJSON(res, 400, { message: "Value is not a valid Discord snowflake" });
    }

    try {
        const response = await fetch(`https://canary.discord.com/api/v10/guilds/${id}/widget.json`, {
            headers: {
                "Content-Type": "application/json"
            }
        });
        const json = await response.json();

        if (json.code && json.code === 50004) {
            return sendJSON(res, 200, {
                error: "The guild is either non-existent, unavailable, or has Server Widget/Discovery disabled."
            });
        }

        const output = {
            id: json.id,
            name: json.name,
            instant_invite: json.instant_invite,
            presence_count: json.presence_count
        };

        return sendJSON(res, 200, output);
    } catch (err) {
        return sendJSON(res, 500, { message: 'Internal Server Error' });
    }
};

const handleApplication = async (req, res, id) => {
    if (isNaN(id)) {
        return sendJSON(res, 400, { message: "Value is not a valid Discord snowflake" });
    }

    try {
        const response = await fetch(`https://canary.discord.com/api/v10/applications/${id}/rpc`, {
            headers: {
                "Content-Type": "application/json"
            }
        });
        const json = await response.json();

        if (json.icon) {
            json.icon = `https://cdn.discordapp.com/avatars/${json.id}/${json.icon}`;
        }

        // Process flags
        let publicFlags = [];
        let flags = json.flags;
        APPLICATION_FLAGS.forEach(flag => {
            if (json.flags & flag.bitwise) publicFlags.push(flag.flag);
        });
        json.flags = {
            bits: flags,
            detailed: publicFlags
        };

        return sendJSON(res, 200, json);
    } catch (err) {
        return sendJSON(res, 500, { message: 'Internal Server Error' });
    }
};

const handleUser = async (req, res, id) => {
    if (isNaN(id)) {
        return sendJSON(res, 400, { message: "Value is not a valid Discord snowflake" });
    }

    try {
        const response = await fetch(`https://canary.discord.com/api/v10/users/${id}`, {
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bot ${process.env.TOKEN}`
            }
        });
        const json = await response.json();

        if (json.message) {
            return sendJSON(res, 200, json);
        }

        // Process flags
        let publicFlags = [];
        USER_FLAGS.forEach(flag => {
            if (json.public_flags & flag.bitwise) publicFlags.push(flag.flag);
        });

        // Avatar link
        let avatarLink = json.avatar
            ? `https://cdn.discordapp.com/avatars/${json.id}/${json.avatar}`
            : null;

        // Banner link
        let bannerLink = json.banner
            ? `https://cdn.discordapp.com/banners/${json.id}/${json.banner}?size=480`
            : null;

        const output = {
            id: json.id,
            created_at: snowflakeToDate(json.id),
            username: json.username,
            avatar: {
                id: json.avatar,
                link: avatarLink,
                is_animated: json.avatar != null && json.avatar.startsWith("a_")
            },
            avatar_decoration: json.avatar_decoration_data,
            badges: publicFlags,
            premium_type: {
                0: "None",
                1: "Nitro Classic",
                2: "Nitro",
                3: "Nitro Basic"
            }[json.premium_type],
            accent_color: json.accent_color,
            global_name: json.global_name,
            banner: {
                id: json.banner,
                link: bannerLink,
                is_animated: json.banner != null && json.banner.startsWith("a_"),
                color: json.banner_color
            },
            raw: json
        };

        return sendJSON(res, 200, output);
    } catch (err) {
        console.error(err);
        return sendJSON(res, 500, { message: 'Internal Server Error' });
    }
};

const requestListener = async (req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    const method = req.method;

    if (method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET,PUT,POST,DELETE',
            'Access-Control-Allow-Headers': 'Content-Type'
        });
        res.end();
        return;
    }

    if (method === 'GET' && pathname === '/') {
        sendJSON(res, 200, { message: 'root page' });
        return;
    }

    if (method === 'GET' && pathname.startsWith('/v1/guild/')) {
        const id = pathname.split('/')[3];
        await handleGuild(req, res, checkValidSnowflake(id));
        return;
    }

    if (method === 'GET' && pathname.startsWith('/v1/application/')) {
        const id = pathname.split('/')[3];
        await handleApplication(req, res, checkValidSnowflake(id));
        return;
    }

    if (method === 'GET' && pathname.startsWith('/v1/user/')) {
        const id = pathname.split('/')[3];
        await handleUser(req, res, checkValidSnowflake(id));
        return;
    }

    // Rota não encontrada
    sendJSON(res, 404, { message: '404 - Not Found' });
};

const server = http.createServer(requestListener);

server.listen(PORT, '127.0.0.1', () => {
    console.log(`Server is running at http://127.0.0.1:${PORT}`);
});