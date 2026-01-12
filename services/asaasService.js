const axios = require('axios');

const ASAAS_URL = process.env.ASAAS_URL || 'https://sandbox.asaas.com/api/v3';
const ASAAS_KEY = process.env.ASAAS_API_KEY;

const api = axios.create({
    baseURL: ASAAS_URL,
    headers: { 'access_token': ASAAS_KEY }
});

// Mantém a criação de cliente (igual)
async function criarClienteAsaas(cliente) {
    try {
        const cpfLimpo = cliente.documento.replace(/\D/g, '');
        const busca = await api.get(`/customers?cpfCnpj=${cpfLimpo}`);
        if (busca.data.data?.length > 0) return busca.data.data[0].id;
        
        const novo = await api.post('/customers', {
            name: cliente.nome, cpfCnpj: cpfLimpo, email: cliente.email, 
            mobilePhone: cliente.telefone.replace(/\D/g, ''), notificationDisabled: false 
        });
        return novo.data.id;
    } catch (e) { throw e; }
}

// 🟢 NOVA FUNÇÃO: GERA LINK COM PARCELAMENTO
// services/asaasService.js

// ... (imports e criarClienteAsaas continuam iguais) ...

async function criarCobrancaPix(cliente, valorTotal, descricao, walletIdAfiliado = null, comissaoAfiliado = 0) {
    try {
        // 1. Configurações do Link para o Cliente ESCOLHER
        let payload = {
            billingType: 'UNDEFINED', // Aceita Pix, Cartão e Boleto
            chargeType: 'DETACHED',   // <--- ISSO É IMPORTANTE! Cria cobrança avulsa
            name: descricao.substring(0, 255),
            description: descricao,
            value: valorTotal,
            dueDateLimitDays: 1,      // Vencimento do link
            
            // 🟢 O SEGREDO ESTÁ AQUI:
            // NÃO enviamos 'installmentCount' (isso travaria o número)
            // Enviamos APENAS o 'maxInstallmentCount' (o limite)
            maxInstallmentCount: 12   
        };

        // Lógica de Split (se tiver)
        if (walletIdAfiliado && comissaoAfiliado > 0) {
            payload.split = [{
                walletId: walletIdAfiliado,
                fixedValue: comissaoAfiliado, 
            }];
        }

        console.log("🚀 Gerando Link Flexível...");
        const response = await api.post('/paymentLinks', payload);
        
        console.log("✅ Link Gerado:", response.data.url);

        return {
            id: response.data.id,
            encodedImage: null, 
            payload: null,
            invoiceUrl: response.data.url 
        };

    } catch (error) {
        const erroDetalhe = error.response?.data?.errors 
            ? JSON.stringify(error.response.data.errors) 
            : error.message;
        console.error("❌ ERRO ASAAS:", erroDetalhe);
        throw new Error(`Erro Asaas: ${erroDetalhe}`);
    }
}


module.exports = { criarCobrancaPix };