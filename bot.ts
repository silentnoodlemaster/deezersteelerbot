import {
  TelegramBot,
  UpdateType,
} from "https://deno.land/x/telegram_bot_api/mod.ts";

const TOKEN = Deno.env.get("TELEGRAM_TOKEN");
const PLEX_TOKEN = Deno.env.get("PLEX_TOKEN");
const PLEX_IP = Deno.env.get("PLEX_IP") ?? "127.0.0.1";
const PLEX_PORT = Deno.env.get("PLEX_PORT") ?? "32400";

const plexBaseUrl = `http://${PLEX_IP}:${PLEX_PORT}/library/sections/`;
const plexUrlSuffix = `/refresh?force=1&X-Plex-Token=${PLEX_TOKEN}`;

if (!TOKEN) throw new Error("No token provided");
const bot = new TelegramBot(TOKEN);
const allowlist: User[] = JSON.parse(
  Deno.readTextFileSync("./allowlist.json"),
);
if (!PLEX_TOKEN) {
  console.warn("no plex token, /refresh command will fail");
}

interface User {
  uid: string;
  extra_args: string[];
  lib_id: number;
}
const regex = /(?:deezer|spotify)\.(?:com|page)/;
bot.on(UpdateType.Message, ({ message }) => {
  var link = "";
  const currentUser = allowlist.find(
    (user) => {
      return user.uid == String(message.from!.id);
    },
  );
  if (currentUser) {
    message.entities?.forEach((entity) => {
      if (entity.type === "url") {
        console.log(entity.type);
        link = message.text?.substr(entity.offset, entity.length) ?? "";
      }
      if (entity.type === "bot_command") {
        if (message.text?.substr(entity.offset, entity.length) == "/refresh") {
          fetch(`${plexBaseUrl}${String(currentUser.lib_id)}${plexUrlSuffix}`)
            .then(
              (responese) => {
                bot.sendMessage({
                  chat_id: message.chat.id,
                  text: responese.statusText,
                });
              },
            );
        } else {
          bot.sendMessage({
            chat_id: message.chat.id,
            text: "Unknown command, did you mean /refresh ?",
          });
        }
      }
    });
    if (regex.test(link)) {
      bot.sendMessage({
        chat_id: message.chat.id,
        text: "Processing request...",
        disable_web_page_preview: true,
      }).then(async (message) => {
        message.message_id;
        const p = Deno.run({
          cmd: ["deemix", ...currentUser.extra_args, link],
          stderr: "piped",
          stdout: "piped",
        });
        const { code } = await p.status();
        var output = new TextDecoder("utf-8").decode(
          (await p.stderrOutput()).valueOf(),
        );
        if (code === 0) {
          if (!output.includes("ERROR:")) {
            output = new TextDecoder("utf-8").decode(
              (await p.output()).valueOf(),
            );
          }
          bot.editMessageText({
            message_id: message.message_id,
            chat_id: message.chat.id,
            text: output,
            disable_web_page_preview: true,
          });
        } else {
          bot.editMessageText({
            message_id: message.message_id,
            chat_id: message.chat.id,
            text: "fatal error",
          });
        }
      });
    } else {
      console.log(`bad link: ${message.text}`);
    }
  } else {
    bot.sendMessage({
      chat_id: message.chat.id,
      text: `${message.from!.id} not authorized`,
    });
  }
});

bot.run({
  polling: true,
});
