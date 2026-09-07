require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  EmbedBuilder,
  PermissionsBitField,
  SlashCommandBuilder,
  Routes
} = require("discord.js");

const { clientId } = require("./config.json");
const countries = require("./countries.json");
const fs = require("fs");
const { REST } = require("@discordjs/rest");
const crypto = require("crypto");

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const GUILDS_FILE = "./guilds.json";
const USERS_FILE = "./users.json";
const ADMIN_FILE = "./adminRoles.json";

let guildsData = fs.existsSync(GUILDS_FILE) ? JSON.parse(fs.readFileSync(GUILDS_FILE)) : {};
let usersData = fs.existsSync(USERS_FILE) ? JSON.parse(fs.readFileSync(USERS_FILE)) : {};
let adminRoles = fs.existsSync(ADMIN_FILE) ? JSON.parse(fs.readFileSync(ADMIN_FILE)) : {};

const rarityEmoji = {
  comum: "⚪",
  incomum: "🟢",
  rara: "🔵",
  épica: "🟣",
  legacy: "🟤"
};

const spawnMap = {};
const adminPanelMap = {};

// ---------------- FUNÇÕES ----------------

function sortearRaridade() {
  const chances = [
    { r: "comum", c: 40 },
    { r: "incomum", c: 25 },
    { r: "rara", c: 25 },
    { r: "épica", c: 10 }
  ];
  let roll = Math.random() * 100;
  let acc = 0;
  for (const i of chances) {
    acc += i.c;
    if (roll <= acc) return i.r;
  }
  return "comum";
}

function sortearCountry() {
  let rar = sortearRaridade();
  let pool = countries.filter(c => c.rarity === rar && !c.legacy);

  if (Math.random() < 0.05) {
    pool = pool.concat(countries.filter(c => c.legacy));
  }

  return pool[Math.floor(Math.random() * pool.length)];
}

async function spawnCountry(channel, country = null, giveUser = null) {
  const c = country || sortearCountry();

  const embed = new EmbedBuilder()
    .setTitle(c.name + (c.legacy ? " (Legacy)" : ""))
    .setDescription(`${rarityEmoji[c.rarity]} **Raridade:** ${c.rarity.toUpperCase()}`)
    .setColor(c.legacy ? 0x7a5c2e : 0x2f3136);

  if (c.image && typeof c.image === "string" && c.image.startsWith("http")) {
    embed.setImage(c.image);
  }

  if (giveUser) {
    if (!usersData[giveUser.id]) usersData[giveUser.id] = { countries: [] };
    usersData[giveUser.id].countries.push(c.name);
    fs.writeFileSync(USERS_FILE, JSON.stringify(usersData, null, 2));
    return giveUser.send({ embeds: [embed] }).catch(() => {});
  }

  const id = "pegar_" + crypto.randomUUID();
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(id)
      .setLabel("Me pegue!")
      .setStyle(ButtonStyle.Primary)
  );

  const msg = await channel.send({ embeds: [embed], components: [row] });
  spawnMap[id] = c;
}

// ---------------- COMANDOS ----------------

const rest = new REST({ version: '10' })
  .setToken(process.env.DISCORD_TOKEN);

const commands = [
  new SlashCommandBuilder().setName("spawnar").setDescription("Força um spawn"),
  new SlashCommandBuilder().setName("setcanal").setDescription("Define o canal de spawn"),
  new SlashCommandBuilder().setName("seuspaíses").setDescription("Mostra seus países"),
  new SlashCommandBuilder().setName("ranking").setDescription("Ranking"),
  new SlashCommandBuilder()
    .setName("paisinfo")
    .setDescription("Info do país")
    .addStringOption(o => o.setName("nome").setDescription("Nome").setRequired(true)),
  new SlashCommandBuilder()
    .setName("cargodono")
    .setDescription("Define cargo do painel")
    .addRoleOption(o => o.setName("cargo").setDescription("Cargo").setRequired(true)),
  new SlashCommandBuilder().setName("painel").setDescription("Painel admin")
  new SlashCommandBuilder()
  .setName("resetranking")
  .setDescription("Reseta o ranking de capturas")
  .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild),
].map(c => c.toJSON());

// ---------------- READY ----------------

client.once("ready", async () => {
  console.log("✅ Bot online:", client.user.tag);

  for (const guild of client.guilds.cache.values()) {
    await rest.put(Routes.applicationGuildCommands(clientId, guild.id), { body: commands });
  }

  setInterval(() => {
    for (const guild of client.guilds.cache.values()) {
      const canalId = guildsData[guild.id] || guild.systemChannelId;
      if (!canalId) continue;
      guild.channels.fetch(canalId)
        .then(ch => spawnCountry(ch))
        .catch(() => {});
    }
  }, 120000);
});

// ---------------- INTERAÇÕES ----------------

client.on("interactionCreate", async interaction => {

  // PEGAR
  if (interaction.isButton() && interaction.customId.startsWith("pegar_")) {
    const c = spawnMap[interaction.customId];
    if (!c) return interaction.reply({ content: "❌ Já foi pega.", ephemeral: true });

    if (!usersData[interaction.user.id]) usersData[interaction.user.id] = { countries: [] };
    usersData[interaction.user.id].countries.push(c.name);
    fs.writeFileSync(USERS_FILE, JSON.stringify(usersData, null, 2));

    delete spawnMap[interaction.customId];
    return interaction.update({ content: `🏳️ **${interaction.user.username}** pegou **${c.name}**`, embeds: [], components: [] });
  }

  // PAINEL
  if (interaction.isChatInputCommand() && interaction.commandName === "painel") {
    const role = adminRoles[interaction.guildId];
    if (!role || !interaction.member.roles.cache.has(role))
      return interaction.reply({ content: "❌ Sem permissão.", ephemeral: true });

    const select = new StringSelectMenuBuilder()
      .setCustomId("painel_raridade")
      .setPlaceholder("Escolha a raridade")
      .addOptions(["comum","incomum","rara","épica","legacy"].map(r => ({
        label: r.toUpperCase(),
        value: r
      })));

    return interaction.reply({
      content: "🛠 Painel Admin",
      components: [new ActionRowBuilder().addComponents(select)],
      ephemeral: true
    });
  }

  if (interaction.isStringSelectMenu() && interaction.customId === "painel_raridade") {
    await interaction.deferUpdate();

    const rar = interaction.values[0];
    const pool = rar === "legacy"
      ? countries.filter(c => c.legacy)
      : countries.filter(c => c.rarity === rar && !c.legacy);

    const options = pool.slice(0, 25).map(c => ({ label: c.name, value: c.name }));

    const select = new StringSelectMenuBuilder()
      .setCustomId("painel_country")
      .setPlaceholder("Escolha a Countryball")
      .addOptions(options);

    return interaction.editReply({
      content: `Raridade: **${rar.toUpperCase()}**`,
      components: [new ActionRowBuilder().addComponents(select)]
    });
  }

  if (interaction.isStringSelectMenu() && interaction.customId === "painel_country") {
    await interaction.deferUpdate();

    const c = countries.find(x => x.name === interaction.values[0]);
    adminPanelMap[interaction.user.id] = { country: c };

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("painel_canal").setLabel("Spawn no canal").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("painel_user").setLabel("Spawn pra mim").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("painel_cancel").setLabel("Cancelar").setStyle(ButtonStyle.Danger)
    );

    return interaction.editReply({ content: `✅ **${c.name}** selecionada`, components: [row] });
  }

  if (interaction.isButton() && interaction.customId.startsWith("painel_")) {
    await interaction.deferUpdate();
    const data = adminPanelMap[interaction.user.id];
    if (!data) return;

    if (interaction.customId === "painel_canal") {
      await spawnCountry(interaction.channel, data.country);
    }

    if (interaction.customId === "painel_user") {
      await spawnCountry(null, data.country, interaction.user);
    }

    delete adminPanelMap[interaction.user.id];
    return interaction.editReply({ content: "✅ Ação concluída.", components: [] });
  }
  
  // RESETAR RANKING
  if (interaction.commandName === "resetranking") {
  if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
    return interaction.reply({
      content: "❌ Você precisa da permissão **Gerenciar Servidor** para resetar o ranking.",
      ephemeral: true
    });
  }

  usersData = {};
  fs.writeFileSync(USERS_FILE, JSON.stringify(usersData, null, 2));

  return interaction.reply({
    content: "✅ **Ranking resetado!** Todas as capturas foram apagadas.",
    ephemeral: true
  });
}

  // COMANDOS
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "setcanal") {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild))
      return interaction.reply({ content: "❌ Sem permissão.", ephemeral: true });

    guildsData[interaction.guildId] = interaction.channel.id;
    fs.writeFileSync(GUILDS_FILE, JSON.stringify(guildsData, null, 2));
    return interaction.reply({ content: "✅ Canal definido.", ephemeral: true });
  }

  if (interaction.commandName === "spawnar") {
    await spawnCountry(interaction.channel);
    return interaction.reply({ content: "🌍 Spawn feito.", ephemeral: true });
  }

  if (interaction.commandName === "seuspaíses") {
    const list = usersData[interaction.user.id]?.countries || [];
    return interaction.reply({
      embeds: [new EmbedBuilder().setTitle("Seus países").setDescription(list.join("\n") || "Nenhum")],
      ephemeral: true
    });
  }

  if (interaction.commandName === "ranking") {
    const rank = Object.entries(usersData)
      .map(([id, d]) => ({ id, c: d.countries?.length || 0 }))
      .sort((a,b)=>b.c-a.c)
      .slice(0,10)
      .map((r,i)=>`${i+1}. <@${r.id}> - ${r.c}`)
      .join("\n");

    return interaction.reply({
      embeds: [new EmbedBuilder().setTitle("🏆 Ranking").setDescription(rank || "Vazio")]
    });
  }

  if (interaction.commandName === "paisinfo") {
    const nome = interaction.options.getString("nome");
    const c = countries.find(x => x.name.toLowerCase() === nome.toLowerCase());
    if (!c) return interaction.reply({ content: "❌ Não encontrado.", ephemeral: true });

    const e = new EmbedBuilder()
      .setTitle(c.name)
      .setDescription(c.info || "Sem info")
      .setColor(0x2f3136);

    if (c.image?.startsWith("http")) e.setImage(c.image);

    return interaction.reply({ embeds: [e], ephemeral: true });
  }

  if (interaction.commandName === "cargodono") {
    const role = interaction.options.getRole("cargo");
    adminRoles[interaction.guildId] = role.id;
    fs.writeFileSync(ADMIN_FILE, JSON.stringify(adminRoles, null, 2));
    return interaction.reply({ content: "✅ Cargo definido.", ephemeral: true });
  }

});

client.login(process.env.DISCORD_TOKEN);
