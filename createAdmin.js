// createAdmin.js
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

// --- CONFIGURE SEU LOGIN AQUI ---
const SEU_EMAIL = "p.victorcavalcante@hotmail.com";
const SUA_SENHA = "Fr33styl3h3ll@";
// ---------------------------------

async function main() {
    console.log("Iniciando criação do admin...");

    // 1. Criptografar a senha
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(SUA_SENHA, salt);
    
    console.log(`Criptografando senha...`);

    // 2. Tentar criar o usuário
    try {
        const admin = await prisma.user.create({
            data: {
                email: SEU_EMAIL,
                password: hashedPassword,
                nome: "Administrador"
            },
        });
        console.log("✅ Sucesso! Usuário administrador criado:");
        console.log(admin);

    } catch (error) {
        // Se der erro "Unique constraint failed" (email já existe)
        if (error.code === 'P2002') {
            console.warn("⚠️ Atenção: O usuário com este email já existe.");
        } else {
            console.error("Erro ao criar admin:", error);
        }
    }
}

// 3. Executar a função
main()
    .catch((e) => {
        throw e;
    })
    .finally(async () => {
        // 4. Fechar a conexão com o banco
        await prisma.$disconnect();
    });