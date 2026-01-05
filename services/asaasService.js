const axios = require('axios');

// No .env: ASAAS_API_KEY e ASAAS_URL
const ASAAS_URL = process.env.ASAAS_URL || 'https://sandbox.asaas.com/api/v3';
const ASAAS_KEY = process.env.ASAAS_API_KEY;

const api = axios.create({
    baseURL: ASAAS_URL,
    headers: { 'access_token': ASAAS_KEY }
});

async function criarClienteAsaas(cliente) {
    try {
        // 1. Limpeza de dados (O PULO DO GATO 😺)
        // Remove tudo que não for número do CPF e Telefone
        const cpfLimpo = cliente.documento.replace(/\D/g, '');
        const telefoneLimpo = cliente.telefone.replace(/\D/g, '');

        // 2. Tenta achar o cliente pelo CPF/CNPJ para não duplicar
        const busca = await api.get(`/customers?cpfCnpj=${cpfLimpo}`);
        if (busca.data.data && busca.data.data.length > 0) {
            return busca.data.data[0].id;
        }

        // 3. Se não achar, cria um novo
        const novo = await api.post('/customers', {
            name: cliente.nome,
            cpfCnpj: cpfLimpo,                 // Envia limpo
            email: cliente.email,
            mobilePhone: telefoneLimpo,        // Envia limpo (sem parênteses)
            notificationDisabled: false 
        });
        return novo.data.id;

    } catch (error) {
        // AQUI ESTÁ A MELHORIA NO LOG DE ERRO:
        const erroDetalhe = error.response?.data?.errors 
            ? JSON.stringify(error.response.data.errors) 
            : error.message;
            
        console.error("❌ ERRO ASAAS (CRIAR CLIENTE):", erroDetalhe);
        
        // Joga o erro detalhado para o frontend ver
        throw new Error(`Asaas recusou o cadastro: ${erroDetalhe}`);
    }
}

async function criarCobrancaPix(cliente, valorTotal, descricao, walletIdAfiliado = null, comissaoAfiliado = 0) {
    try {
        // 1. Garante que o cliente existe (ou cria)
        const customerId = await criarClienteAsaas(cliente);
        

        // 2. Monta o objeto de cobrança
        let payload = {
            customer: customerId,
            billingType: 'PIX',
            value: valorTotal,
            dueDate: new Date().toISOString().split('T')[0], // Vence hoje
            description: descricao,
        };

        // 3. Lógica de Split
        if (walletIdAfiliado && comissaoAfiliado > 0) {
            payload.split = [{
                walletId: walletIdAfiliado,
                fixedValue: comissaoAfiliado, 
            }];
        }

        // 4. Cria a cobrança
        const response = await api.post('/payments', payload);
        const idCobranca = response.data.id;

        // 5. Pega o QRCode
        const qrResponse = await api.get(`/payments/${idCobranca}/pixQrCode`);
        
        return {
            id: idCobranca,
            encodedImage: qrResponse.data.encodedImage,
            payload: qrResponse.data.payload,
            expirationDate: qrResponse.data.expirationDate,
            invoiceUrl: response.data.invoiceUrl
        };

    } catch (error) {
        // Melhoria no Log aqui também
        const erroDetalhe = error.response?.data?.errors 
            ? JSON.stringify(error.response.data.errors) 
            : error.message;

        console.error("❌ ERRO ASAAS (COBRANÇA):", erroDetalhe);
        throw new Error(`Erro ao gerar Pix: ${erroDetalhe}`);
    }
}

module.exports = { criarCobrancaPix };