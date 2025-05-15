import "dotenv/config";
import { WebhookClient, EmbedBuilder } from "discord.js";

const client = new WebhookClient({
    url: process.env.DISCORD_WEBHOOK_URL
});

const data = {
    title: "Le status de l'application a changé de ACTIF à ACTIF",
    color: "#008000",
    url: process.env.MONITORING_URL
}

// status = response.status >= 200 && response.status < 300 ? 'up' : 'down';

const generateEmbed = (data) => {
    return new EmbedBuilder()
        .setTitle(data.title)
        .setColor(data.color)
        .addFields(
            { name: "URL", value: data.url },
            { name: "Timestamp", value: new Date().toLocaleString("fr") }
        )
}

const embed = generateEmbed(data);

client.send({
	username: "Thresh",
	embeds: [embed],
});