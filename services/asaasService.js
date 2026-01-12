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
async function criarCobrancaPix(cliente, valorTotal, descricao, walletIdAfiliado = null, comissaoAfiliado = 0) {
    try {
        // Nota: Para Links de Pagamento, criar o cliente antes é opcional, 
        // mas ajuda a manter o cadastro organizado.
        
        // 1. Configurações do Link
        let payload = {
            billingType: 'UNDEFINED', // Aceita Pix, Cartão e Boleto
            chargeType: 'INSTALLMENT',   // Cria uma cobrança nova para cada cliente
            name: descricao.substring(0, 255),
            description: descricao,
            endDate: null,            // Não expira o link principal (mas a cobrança sim)
            value: valorTotal,
            dueDateLimitDays: 1,      // Vencimento: 1 dia após clicar
            installmentCount: 2,       // Força 2 parcelas
            installmentValue: valorTotal / 2, // Valor de cada parcela
            maxInstallmentCount: 10   // <--- LIBERA ATÉ 10x NO CARTÃO
        };

        // 2. Cria o Link
        console.log("🚀 Gerando Link de Pagamento...");
        const response = await api.post('/paymentLinks', payload);
        
        const linkId = response.data.id;  // ID do Link (ex: 123456)
        const linkUrl = response.data.url; // URL para o cliente pagar

        console.log("✅ Link Gerado:", linkUrl);

        // Retornamos num formato que seu site já entende
        return {
            id: linkId,          // Guardamos o ID do Link agora!
            encodedImage: null,  // Link não gera QR Code direto (sem imagem)
            payload: null,       // Sem copia e cola direto
            invoiceUrl: linkUrl  // O link mágico
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