const axios = require('axios');
const ASAAS_URL = process.env.ASAAS_URL || 'https://sandbox.asaas.com/api/v3';
const ASAAS_KEY = process.env.ASAAS_API_KEY;

const api = axios.create({ baseURL: ASAAS_URL, headers: { 'access_token': ASAAS_KEY } });

async function criarClienteAsaas(cliente) {
    // ... (MANTENHA SUA FUNÇÃO DE CLIENTE IGUAL ANTES) ...
    // Vou resumir aqui para não ficar gigante, use a que você já tem
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

async function criarCobrancaPix(cliente, valorTotal, descricao, walletIdAfiliado = null, comissaoAfiliado = 0) {
    try {
        const customerId = await criarClienteAsaas(cliente);

        let payload = {
            customer: customerId,
            billingType: 'UNDEFINED', // 🟢 MUDANÇA: 'UNDEFINED' libera Cartão e Boleto no link!
            value: valorTotal,
            dueDate: new Date().toISOString().split('T')[0],
            description: descricao,
        };

        if (walletIdAfiliado && comissaoAfiliado > 0) {
            payload.split = [{ walletId: walletIdAfiliado, fixedValue: comissaoAfiliado }];
        }

        // 1. Cria a Cobrança Genérica
        const response = await api.post('/payments', payload);
        const idCobranca = response.data.id;
        const linkFatura = response.data.invoiceUrl; // ESSE LINK AGORA ACEITA CARTÃO!

        // 2. Tenta pegar o QR Code do Pix (Pode falhar se for Undefined, mas tentamos)
        let pixData = { encodedImage: '', payload: '', expirationDate: '' };
        
        try {
            // Tenta forçar a leitura do QR Code mesmo sendo Undefined
            const qrResponse = await api.get(`/payments/${idCobranca}/pixQrCode`);
            pixData = qrResponse.data;
        } catch (err) {
            console.log("⚠️ Pix não gerado automaticamente (Normal para cobrança Híbrida)");
            // Se falhar, mandamos uma imagem de "Use o Link" ou deixamos vazio
        }
        
        return {
            id: idCobranca,
            encodedImage: pixData.encodedImage, // Pode vir vazio
            payload: pixData.payload,           // Pode vir vazio
            invoiceUrl: linkFatura              // 🟢 ESSE É O IMPORTANTE AGORA
        };

    } catch (error) {
        console.error("Erro Asaas:", error.response?.data || error.message);
        throw new Error("Erro no pagamento.");
    }
}

module.exports = { criarCobrancaPix };