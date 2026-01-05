const axios = require('axios');

const ASAAS_URL = process.env.ASAAS_URL || 'https://sandbox.asaas.com/api/v3';
const ASAAS_KEY = process.env.ASAAS_API_KEY;

const api = axios.create({
    baseURL: ASAAS_URL,
    headers: { 'access_token': ASAAS_KEY }
});

// ... (criarClienteAsaas continua IGUAL, não precisa mudar) ...
async function criarClienteAsaas(cliente) {
    try {
        const cpfLimpo = cliente.documento.replace(/\D/g, '');
        const telefoneLimpo = cliente.telefone.replace(/\D/g, '');

        const busca = await api.get(`/customers?cpfCnpj=${cpfLimpo}`);
        if (busca.data.data && busca.data.data.length > 0) {
            return busca.data.data[0].id;
        }

        const novo = await api.post('/customers', {
            name: cliente.nome,
            cpfCnpj: cpfLimpo,
            email: cliente.email,
            mobilePhone: telefoneLimpo,
            notificationDisabled: false 
        });
        return novo.data.id;
    } catch (error) {
        console.error("❌ ERRO CLIENTE:", error.message);
        throw error;
    }
}

// 🟢 NOVA FUNÇÃO MAIS INTELIGENTE
async function criarCobrancaPix(cliente, valorTotal, descricao, walletIdAfiliado = null, comissaoAfiliado = 0) {
    try {
        const customerId = await criarClienteAsaas(cliente);
        
        // MUDANÇA 1: Não travamos mais em 'PIX' se quisermos flexibilidade.
        // Mas para ter o QR CODE imediato no modal, o Asaas EXIGE que seja 'PIX'.
        // O Truque: Vamos manter PIX, mas vamos retornar o link mesmo assim.
        
        let payload = {
            customer: customerId,
            billingType: 'PIX', // Mantém PIX para o QR Code funcionar na hora
            value: valorTotal,
            dueDate: new Date().toISOString().split('T')[0],
            description: descricao,
        };

        if (walletIdAfiliado && comissaoAfiliado > 0) {
            payload.split = [{
                walletId: walletIdAfiliado,
                fixedValue: comissaoAfiliado, 
            }];
        }

        console.log("🚀 Criando cobrança no Asaas...");
        const response = await api.post('/payments', payload);
        const idCobranca = response.data.id;
        const linkFatura = response.data.invoiceUrl; // Captura o Link

        console.log("✅ Cobrança Criada! ID:", idCobranca);

        // Pega o QRCode
        const qrResponse = await api.get(`/payments/${idCobranca}/pixQrCode`);
        
        return {
            id: idCobranca,
            encodedImage: qrResponse.data.encodedImage,
            payload: qrResponse.data.payload,
            expirationDate: qrResponse.data.expirationDate,
            invoiceUrl: linkFatura // <--- O LINK ESTÁ AQUI
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