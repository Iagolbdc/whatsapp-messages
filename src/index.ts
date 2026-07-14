import { Client, LocalAuth, Message, MessageMedia } from "whatsapp-web.js";
import * as qrcode from 'qrcode-terminal';
import fs from 'fs';
import csv from 'csv-parser';

const HORA_INICIO = 9;
const HORA_ALMOCO_INICIO = 12;
const HORA_ALMOCO_FIM = 13;
const HORA_FIM = 21;

const PAUSA_A_CADA = 50;

const CSV_PATH = "./media/contatos.csv";
const IMGE_PATH = './media/imagem.jpg';
const MENSAGEM_PATH = "./media/mensagem.txt";

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        args: ['--no-sandbox']
    }
});

client.on('qr', (qr) => {
    console.log("QR gerado");
    qrcode.generate(qr, { small: true });
});

client.on('authenticated', () => {
    console.log("Autenticado");
});

client.on('auth_failure', (msg) => {
    console.log("Falha de autenticação:", msg);
});

client.on('ready', () => {
    console.log("READY");
});

client.on('disconnected', (reason) => {
    console.log("Desconectado:", reason);
});

client.on('ready', async () => {
    console.log("WhatsApp conectado!");

    try {
        await iniciarDisparo();
    } catch (err) {
        console.error(err);
    }
});

async function iniciarDisparo() {

    const contatos = await lerCSV(CSV_PATH);

    const mensagem = lerMensagem(MENSAGEM_PATH);

    const imagem = MessageMedia.fromFilePath(IMGE_PATH);

    let enviados = 0;

    const pendentes = contatos.filter(c => c.status !== "enviado").length;

    console.log(`Total de contatos: ${contatos.length}`);
    console.log(`Pendentes: ${pendentes}`);

    for (const contato of contatos) {

        if (
            contato.status === "enviado" ||
            contato.status === "invalido"
        ) {
            continue;
        }

        await aguardarHorarioPermitido();

        const contatoId = await client.getNumberId(contato.telefone);

        if (!contatoId) {
            console.log(`${contato.telefone} não possui WhatsApp`);

            contato.status = "invalido";
            contato.data_envio = new Date().toLocaleString("pt-BR");

            try {
                await salvarCSV(CSV_PATH, contatos);
            } catch (err) {
                console.error("Erro ao salvar CSV");
                console.error(err);
            }

            continue;
        }

        try {

            console.log(
                `[${enviados + 1}/${pendentes}] Enviando para ${contato.nome}`
            );

            await client.sendMessage(
                contatoId._serialized,
                imagem,
                {
                    caption: mensagem
                }
            );
            
            contato.status = "enviado";
            contato.data_envio = new Date().toLocaleString("pt-BR");

            try {
                await salvarCSV(CSV_PATH, contatos);
            } catch (err) {
                console.error("Erro ao salvar CSV");
                console.error(err);
            }

            enviados++;

            // Pausa maior
            if (enviados % PAUSA_A_CADA === 0) {

                const pausa = tempoAleatorio(
                    8 * 60 * 1000,
                    12 * 60 * 1000
                );

                console.log(
                    `Bloco de ${PAUSA_A_CADA} envios concluído. Descansando ${Math.round(pausa / 60000)} minutos.`
                );

                await sleep(pausa);

            }

            // Pausa normal
            const espera = tempoAleatorio(
                15 * 1000,
                80 * 1000
            );

            console.log(
                `Próximo envio em ${(espera / 1000).toFixed(0)} segundos`
            );

            await sleep(espera);

        } catch (e) {

            console.error(`Erro com ${contato.nome}`);

            console.error(e);

            contato.status = "erro";
            contato.data_envio = new Date().toLocaleString("pt-BR");

            try {
                await salvarCSV(CSV_PATH, contatos);
            } catch (err) {
                console.error("Erro ao salvar CSV");
                console.error(err);
            }

        }

    }

    console.log("Disparo finalizado.");

    console.log("--------------------------------");
    console.log("Todos os contatos foram processados.");
    console.log("Encerrando aplicação...");
    console.log("--------------------------------");

    await client.destroy();

    process.exit(0);

}

function tempoAleatorio(min: number, max: number) {

    return Math.floor(
        Math.random() * (max - min + 1)
    ) + min;

}

async function aguardarHorarioPermitido() {

    while (true) {

        const agora = new Date();
        const hora = agora.getHours();

        let proximoHorario: Date | null = null;

        if (hora < HORA_INICIO) {

            proximoHorario = new Date();
            proximoHorario.setHours(HORA_INICIO, 0, 0, 0);

        } else if (hora >= HORA_ALMOCO_INICIO && hora < HORA_ALMOCO_FIM) {

            proximoHorario = new Date();
            proximoHorario.setHours(HORA_ALMOCO_FIM, 0, 0, 0);

        } else if (hora >= HORA_FIM) {

            proximoHorario = new Date();
            proximoHorario.setDate(proximoHorario.getDate() + 1);
            proximoHorario.setHours(HORA_INICIO, 0, 0, 0);

        } else {

            return;

        }

        const espera = proximoHorario.getTime() - agora.getTime();

        console.log(
            `Fora do horário permitido. Próximo envio às ${proximoHorario.toLocaleString("pt-BR")}`
        );

        await sleep(espera);

    }

}

interface Contato {
    nome: string;
    telefone: string;
    status: string;
    data_envio: string;
}
function lerCSV(caminho: string): Promise<Contato[]> {

    return new Promise((resolve) => {

        const contatos: Contato[] = [];

        fs.createReadStream(caminho)
            .pipe(csv())
            .on('data', (row) => {

                contatos.push({
                    nome: row.nome,
                    telefone: row.telefone,
                    status: row.status,
                    data_envio: row.data_envio
                });

            })
            .on('end', () => resolve(contatos));

    });

}

async function salvarCSV(caminho: string, contatos: Contato[]) {

    const linhas = [
        "nome,telefone,status,data_envio"
    ];

    for (const contato of contatos) {

        linhas.push(
            `${contato.nome},${contato.telefone},${contato.status},${contato.data_envio}`
        );

    }

    fs.writeFileSync(
        caminho,
        linhas.join("\n"),
        "utf8"
    );

}

function sleep(ms: number) {

    return new Promise(resolve => setTimeout(resolve, ms));

}

function lerMensagem(caminho: string): string {

    try {

        return fs.readFileSync(caminho, "utf8").trim();

    } catch (err) {

        console.error("Não foi possível ler o arquivo de mensagem.");
        throw err;

    }

}

console.log('[INICIALIZAÇÃO] Iniciando cliente WhatsApp...');
client.initialize().catch(error => {
    console.error(error);
    process.exit(1);
});

