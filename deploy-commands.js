require('dotenv').config();

const {
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits
} = require('discord.js');

const { clientId, guildId } = require('./config.json');

const commands = [

  new SlashCommandBuilder()
    .setName('setcanal')
    .setDescription('Define o canal onde as countryballs irão spawnar')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName('spawnar')
    .setDescription('Força o spawn de uma countryball')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName('capturar')
    .setDescription('Captura a countryball ativa'),

  new SlashCommandBuilder()
    .setName('seuspaises')
    .setDescription('Mostra os países que você já capturou'),

  new SlashCommandBuilder()
    .setName('ranking')
    .setDescription('Mostra o ranking de capturas')

  new SlashCommandBuilder()
  .setName('resetranking')
  .setDescription('Reseta o ranking de capturas')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)

].map(command => command.toJSON());

const rest = new REST({ version: '10' })
  .setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('🔄 Registrando Slash Commands da guild...');

    await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: commands }
    );

    console.log('✅ Slash Commands da guild registrados com sucesso!');
  } catch (error) {
    console.error('❌ Erro ao registrar comandos:', error);
    process.exit(1);
  }
})();
