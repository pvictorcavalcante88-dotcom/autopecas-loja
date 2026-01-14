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

// services/asaasService.js

// Função para gerar PIX DIRETO (com QR Code e Copia e Cola)
async function criarCobrancaPixDireto(cliente, valorTotal, descricao, walletIdAfiliado, comissaoAfiliado) {
    try {
        const clienteId = await criarClienteAsaas(cliente);

        const payload = {
            customer: clienteId,
            billingType: 'PIX',
            value: Number(valorTotal.toFixed(2)), // 🔴 ARREDONDAMENTO OBRIGATÓRIO
            dueDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
            description: descricao,
        };

        if (walletIdAfiliado && comissaoAfiliado > 0) {
            payload.split = [{
                walletId: walletIdAfiliado,
                fixedValue: Number(comissaoAfiliado.toFixed(2)), // 🔴 ARREDONDAMENTO OBRIGATÓRIO
            }];
        }

        const cobranca = await api.post('/payments', payload);
        const paymentId = cobranca.data.id;
        const qrCodeData = await api.get(`/payments/${paymentId}/pixQrCode`);

        return {
            id: paymentId,
            payload: qrCodeData.data.payload,
            encodedImage: qrCodeData.data.encodedImage,
            invoiceUrl: cobranca.data.invoiceUrl
        };
    } catch (e) {
        const msg = e.response?.data?.errors ? JSON.stringify(e.response.data.errors) : e.message;
        throw new Error("Erro Asaas PIX: " + msg);
    }
}

// Função de LINK (usada para Cartão/Parcelamento)
async function criarLinkPagamento(cliente, valorTotal, descricao, walletIdAfiliado, comissaoAfiliado) {
    try {
        const payload = {
            billingType: 'UNDEFINED',
            chargeType: 'DETACHED',
            name: descricao.substring(0, 255),
            value: Number(valorTotal.toFixed(2)), // 🔴 ARREDONDAMENTO OBRIGATÓRIO
            maxInstallmentCount: 12
        };

        if (walletIdAfiliado && comissaoAfiliado > 0) {
            payload.split = [{ 
                walletId: walletIdAfiliado, 
                fixedValue: Number(comissaoAfiliado.toFixed(2)) // 🔴 ARREDONDAMENTO OBRIGATÓRIO
            }];
        }

        const response = await api.post('/paymentLinks', payload);
        return {
            id: response.data.id,
            payload: null,
            encodedImage: null,
            invoiceUrl: response.data.url
        };
    } catch (e) { 
        const msg = e.response?.data?.errors ? JSON.stringify(e.response.data.errors) : e.message;
        throw new Error("Erro Asaas Link: " + msg);
    }
}

module.exports = { criarCobrancaPixDireto, criarLinkPagamento };

module.exports = { criarCobrancaPixDireto, criarLinkPagamento };