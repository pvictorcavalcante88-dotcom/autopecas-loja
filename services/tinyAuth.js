const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function getValidToken() {
    // 1. Busca usando o nome exato do seu model no singular/minúsculo
    const config = await prisma.tinyConfig.findFirst(); 
    
    if (!config || !config.refreshToken) {
        throw new Error("Nenhum token inicial encontrado. Acesse /admin/tiny/autorizar");
    }

    const agora = new Date();
    // Margem de 5 minutos
    const expiracaoComMargem = new Date(config.expiresAt.getTime() - 300000);

    // 2. Verifica validade
    if (config.accessToken && expiracaoComMargem > agora) {
        return config.accessToken;
    }

    console.log("🔄 Renovando Token expirado...");
    
    const params = new URLSearchParams();
    params.append('grant_type', 'refresh_token');
    params.append('client_id', process.env.TINY_CLIENT_ID);
    params.append('client_secret', process.env.TINY_CLIENT_SECRET);
    params.append('refresh_token', config.refreshToken);

    try {
        const response = await axios.post('https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/token', params);
        
        const { access_token, refresh_token, expires_in } = response.data;
        const novaExpiracao = new Date(Date.now() + expires_in * 1000);

        // 3. Atualiza usando os nomes de campos do seu Model TinyConfig
        await prisma.tinyConfig.update({
            where: { id: config.id },
            data: {
                accessToken: access_token,
                refreshToken: refresh_token,
                expiresAt: novaExpiracao
            }
        });

        return access_token;
    } catch (error) {
        console.error("❌ Falha na renovação:", error.response?.data || error.message);
        throw new Error("Sessão Tiny expirou. Reautorize o app.");
    }
}

module.exports = { getValidToken };