// services/asaasService.js
const axios = require('axios');

// No .env: ASAAS_API_KEY=sua_chave_aqui e ASAAS_URL=https://sandbox.asaas.com/api/v3 (para testes)
const ASAAS_URL = process.env.ASAAS_URL || 'https://sandbox.asaas.com/api/v3';
const ASAAS_KEY = process.env.ASAAS_API_KEY;

const api = axios.create({
    baseURL: ASAAS_URL,
    headers: { 'access_token': ASAAS_KEY }
});

async function criarClienteAsaas(cliente) {
    try {
        // 1. Tenta achar o cliente pelo CPF/CNPJ para não duplicar
        const busca = await api.get(`/customers?cpfCnpj=${cliente.documento}`);
        if (busca.data.data && busca.data.data.length > 0) {
            return busca.data.data[0].id;
        }

        // 2. Se não achar, cria um novo
        const novo = await api.post('/customers', {
            name: cliente.nome,
            cpfCnpj: cliente.documento,
            email: cliente.email,
            mobilePhone: cliente.telefone,
            notificationDisabled: false // Asaas envia email/sms automático (opcional)
        });
        return novo.data.id;
    } catch (error) {
        console.error("Erro criar cliente Asaas:", error.response?.data || error.message);
        throw new Error("Falha ao cadastrar cliente no pagamento.");
    }
}

async function criarCobrancaPix(cliente, valorTotal, descricao, walletIdAfiliado = null, comissaoAfiliado = 0) {
    try {
        // 1. Garante que o cliente existe no Asaas
        const customerId = await criarClienteAsaas(cliente);

        // 2. Monta o objeto de cobrança
        let payload = {
            customer: customerId,
            billingType: 'PIX',
            value: valorTotal,
            dueDate: new Date().toISOString().split('T')[0], // Vence hoje
            description: descricao,
        };

        // 🟢 3. LÓGICA DE SPLIT (SE TIVER AFILIADO)
        // Se passarmos o walletId (chave da carteira do afiliado no Asaas), ele divide
        if (walletIdAfiliado && comissaoAfiliado > 0) {
            payload.split = [{
                walletId: walletIdAfiliado,
                fixedValue: comissaoAfiliado, // Valor em R$ que vai pro afiliado
                // Ou use 'percentualValue' se preferir %
            }];
        }

        // 4. Cria a cobrança
        const response = await api.post('/payments', payload);
        const idCobranca = response.data.id;

        // 5. Pega o QRCode e o Código Copia e Cola
        const qrResponse = await api.get(`/payments/${idCobranca}/pixQrCode`);
        
        return {
            id: idCobranca,
            encodedImage: qrResponse.data.encodedImage, // Imagem base64 do QR
            payload: qrResponse.data.payload, // Código Copia e Cola
            expirationDate: qrResponse.data.expirationDate
        };

    } catch (error) {
        console.error("Erro Cobrança Pix:", error.response?.data || error.message);
        throw error;
    }
}

module.exports = { criarCobrancaPix };