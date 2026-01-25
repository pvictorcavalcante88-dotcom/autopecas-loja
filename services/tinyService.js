const axios = require('axios');
const { getValidToken } = require('./tinyAuth'); // Função que busca o token no seu model TinyConfig

async function enviarPedidoParaTiny(pedido) {
    try {
        // 1. Pega o token automático do seu model TinyConfig
        const token = await getValidToken();

        // 2. Tratamento dos itens
        const listaItens = typeof pedido.itens === 'string' ? JSON.parse(pedido.itens) : pedido.itens;

        // 3. Monta o JSON no formato EXATO da API V3
        const dadosPedido = {
            data: new Date(pedido.createdAt).toISOString().split('T')[0],
            cliente: {
                nome: pedido.clienteNome,
                cpf_cnpj: pedido.clienteDoc,
                telefone: pedido.clienteTelefone,
                email: pedido.clienteEmail,
                endereco: pedido.clienteEndereco,
            },
            itens: listaItens.map(item => ({
                codigo: item.referencia || item.id.toString(),
                descricao: item.nome,
                quantidade: item.qtd,
                valor_unitario: parseFloat(item.unitario),
                unidade: "UN"
            })),
            meio_pagamento: pedido.metodoPagamento === 'PIX' ? 'pix' : 'cartao_credito',
            situacao: "aberto"
        };

        // 4. A NOVA URL (V3)
        const url = `https://api.tiny.com.br/public-api/v3/pedidos`;

        console.log(`🚀 Enviando Pedido #${pedido.id} via API V3...`);

        // 5. ENVIO COM HEADER BEARER
        const response = await axios.post(url, dadosPedido, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        // Na V3, o sucesso retorna status 201 (Created)
        if (response.status === 201 || response.status === 200) {
            console.log(`✅ Sucesso na V3! ID: ${response.data.data?.id}`);
            return { sucesso: true, tinyId: response.data.data?.id };
        }

    } catch (error) {
        // Log detalhado para a gente não ficar no escuro
        const erroDetalhado = error.response?.data || error.message;
        console.error("❌ Erro na API V3:", JSON.stringify(erroDetalhado));
        return { sucesso: false, erro: erroDetalhado };
    }
}

module.exports = { enviarPedidoParaTiny };