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

// services/asaasService.js

// Função para gerar PIX DIRETO (com QR Code e Copia e Cola)
async function criarCobrancaPixDireto(cliente, valorTotal, descricao, walletIdAfiliado, comissaoAfiliado) {
    try {
        const clienteId = await criarClienteAsaas(cliente);

        const payload = {
            customer: clienteId,
            billingType: 'PIX',
            value: valorTotal,
            dueDate: new Date(Date.now() + 86400000).toISOString().split('T')[0], // Amanhã
            description: descricao,
        };

        if (walletIdAfiliado && comissaoAfiliado > 0) {
            payload.split = [{
                walletId: walletIdAfiliado,
                fixedValue: comissaoAfiliado,
            }];
        }

        // 1. Cria a cobrança
        const cobranca = await api.post('/payments', payload);
        const paymentId = cobranca.data.id;

        // 2. Busca o QR Code e o Copia e Cola
        const qrCodeData = await api.get(`/payments/${paymentId}/pixQrCode`);

        return {
            id: paymentId,
            payload: qrCodeData.data.payload,
            encodedImage: qrCodeData.data.encodedImage,
            invoiceUrl: cobranca.data.invoiceUrl
        };
    } catch (e) {
        throw new Error("Erro ao gerar PIX Direto: " + e.message);
    }
}

// Sua função de LINK (usada para Cartão/Parcelamento)
async function criarLinkPagamento(cliente, valorTotal, descricao, walletIdAfiliado, comissaoAfiliado) {
    try {
        // ... sua lógica atual de /paymentLinks
        const payload = {
            billingType: 'UNDEFINED',
            chargeType: 'DETACHED',
            name: descricao,
            value: valorTotal,
            maxInstallmentCount: 12
        };

        if (walletIdAfiliado && comissaoAfiliado > 0) {
            payload.split = [{ walletId: walletIdAfiliado, fixedValue: comissaoAfiliado }];
        }

        const response = await api.post('/paymentLinks', payload);
        return {
            id: response.data.id,
            payload: null,
            encodedImage: null,
            invoiceUrl: response.data.url
        };
    } catch (e) { throw e; }
}

module.exports = { criarCobrancaPixDireto, criarLinkPagamento };