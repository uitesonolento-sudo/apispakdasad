const fetch = require('node-fetch');
const { snowflakeToDate } = require("../../utils");

const { USER_FLAGS, APPLICATION_FLAGS } = require("../../Constants");

exports.handler = async (event, context) => {
  const { httpMethod, path } = event;

  // Para CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,PUT,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  // Tratamento para preflight CORS
  if (httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers,
      body: '',
    };
  }

  // Roteamento simples baseado no path
  const routeParts = path.split('/').filter(Boolean); // remove vazios
  const resource = routeParts[0]; // 'v1'
  const type = routeParts[1]; // 'guild', 'application', 'user'
  const id = routeParts[2];

  // Funções de manipulação
  const sendResponse = (status, data) => ({
    statusCode: status,
    headers,
    body: JSON.stringify(data),
  });

  if (resource === 'v1') {
    if (type === 'guild' && id) {
      return handleGuild(id, sendResponse);
    } else if (type === 'application' && id) {
      return handleApplication(id, sendResponse);
    } else if (type === 'user' && id) {
      return handleUser(id, sendResponse);
    }
  }

  // Rota não encontrada
  return sendResponse(404, { message: '404 - Not Found' });
};

// Funções de manipulação
const handleGuild = async (id, sendResponse) => {
  if (isNaN(id)) {
    return sendResponse(400, { message: 'Value is not a valid Discord snowflake' });
  }

  try {
    const response = await fetch(`https://canary.discord.com/api/v10/guilds/${id}/widget.json`, {
      headers: { 'Content-Type': 'application/json' },
    });
    const json = await response.json();

    if (json.code && json.code === 50004) {
      return sendResponse(200, {
        error: 'The guild is either non-existent, unavailable, or has Server Widget/Discovery disabled.',
      });
    }

    const output = {
      id: json.id,
      name: json.name,
      instant_invite: json.instant_invite,
      presence_count: json.presence_count,
    };

    return sendResponse(200, output);
  } catch (err) {
    return sendResponse(500, { message: 'Internal Server Error' });
  }
};

const handleApplication = async (id, sendResponse) => {
  if (isNaN(id)) {
    return sendResponse(400, { message: 'Value is not a valid Discord snowflake' });
  }

  try {
    const response = await fetch(`https://canary.discord.com/api/v10/applications/${id}/rpc`, {
      headers: { 'Content-Type': 'application/json' },
    });
    const json = await response.json();

    if (json.icon) {
      json.icon = `https://cdn.discordapp.com/avatars/${json.id}/${json.icon}`;
    }

    let publicFlags = [];
    let flags = json.flags;
    APPLICATION_FLAGS.forEach(flag => {
      if (json.flags & flag.bitwise) publicFlags.push(flag.flag);
    });
    json.flags = {
      bits: flags,
      detailed: publicFlags,
    };

    return sendResponse(200, json);
  } catch (err) {
    return sendResponse(500, { message: 'Internal Server Error' });
  }
};

const handleUser = async (id, sendResponse) => {
  if (isNaN(id)) {
    return sendResponse(400, { message: 'Value is not a valid Discord snowflake' });
  }

  try {
    const response = await fetch(`https://canary.discord.com/api/v10/users/${id}`, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bot ${process.env.TOKEN}`,
      },
    });
    const json = await response.json();

    if (json.message) {
      return sendResponse(200, json);
    }

    // Flags
    let publicFlags = [];
    USER_FLAGS.forEach(flag => {
      if (json.public_flags & flag.bitwise) publicFlags.push(flag.flag);
    });

    // Links
    const avatarLink = json.avatar
      ? `https://cdn.discordapp.com/avatars/${json.id}/${json.avatar}`
      : null;
    const bannerLink = json.banner
      ? `https://cdn.discordapp.com/banners/${json.id}/${json.banner}?size=480`
      : null;

    const output = {
      id: json.id,
      created_at: snowflakeToDate(json.id),
      username: json.username,
      avatar: {
        id: json.avatar,
        link: avatarLink,
        is_animated: json.avatar != null && json.avatar.startsWith('a_'),
      },
      avatar_decoration: json.avatar_decoration_data,
      badges: publicFlags,
      premium_type: {
        0: 'None',
        1: 'Nitro Classic',
        2: 'Nitro',
        3: 'Nitro Basic',
      }[json.premium_type],
      accent_color: json.accent_color,
      global_name: json.global_name,
      banner: {
        id: json.banner,
        link: bannerLink,
        is_animated: json.banner != null && json.banner.startsWith('a_'),
        color: json.banner_color,
      },
      raw: json,
    };

    return sendResponse(200, output);
  } catch (err) {
    console.error(err);
    return sendResponse(500, { message: 'Internal Server Error' });
  }
};
