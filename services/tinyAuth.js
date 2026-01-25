// services/tinyAuth.js
const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function getValidToken() {
    // 1. Busca os tokens salvos (Certifique-se que a tabela 'configuracao' existe no seu schema.prisma)
    const config = await prisma.configuracao.findFirst(); 
    
    if (!config || !config.refresh_token) {
        throw new Error("Nenhum token encontrado no banco. Você precisa autorizar o Tiny primeiro.");
    }

    const agora = new Date();
    // Adicionamos uma margem de segurança de 5 minutos (300.000 ms)
    const expiracaoComMargem = new Date(config.expires_at.getTime() - 300000);

    // 2. Se o token ainda é válido, retorna ele
    if (config.access_token && expiracaoComMargem > agora) {
        return config.access_token;
    }

    // 3. Se expirou ou está perto de expirar, renova
    console.log("🔄 Token expirado ou perto do fim. Renovando no Tiny...");
    
    const params = new URLSearchParams();
    params.append('grant_type', 'refresh_token');
    params.append('client_id', process.env.TINY_CLIENT_ID);
    params.append('client_secret', process.env.TINY_CLIENT_SECRET);
    params.append('refresh_token', config.refresh_token);

    try {
        const response = await axios.post('https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/token', params);
        
        const { access_token, refresh_token, expires_in } = response.data;
        const novaExpiracao = new Date(Date.now() + expires_in * 1000);

        // 4. Salva os novos tokens no banco para o próximo uso
        await prisma.configuracao.update({
            where: { id: config.id },
            data: {
                access_token,
                refresh_token,
                expires_at: novaExpiracao
            }
        });

        return access_token;
    } catch (error) {
        console.error("❌ Erro ao renovar token:", error.response?.data || error.message);
        throw new Error("Sessão com Tiny expirou. Acesse /admin/tiny/autorizar novamente.");
    }
}

module.exports = { getValidToken };