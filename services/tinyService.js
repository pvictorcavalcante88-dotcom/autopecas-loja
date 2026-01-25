const axios = require('axios');
// No topo do seu tinyService.js
const { getValidToken } = require('./tinyAuth'); // Ajustado para o nome real do arquivo


async function enviarPedidoParaTiny(pedido) {
    try {
        // 1. Pega o token atualizado (V3 exige Bearer Token)
        const token = await getValidToken();

        // 2. Tratamento dos itens
        const listaItens = typeof pedido.itens === 'string' ? JSON.parse(pedido.itens) : pedido.itens;

        // 3. Monta o JSON no formato da API V3
        // Nota: A estrutura da V3 pode ter pequenas variações de nomes de campos
        const dadosPedido = {
            data: new Date(pedido.createdAt).toISOString().split('T')[0], // Formato YYYY-MM-DD
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
                valor_unitario: item.unitario,
                unidade: "UN"
            })),
            meio_pagamento: pedido.metodoPagamento === 'PIX' ? 'pix' : 'cartao_credito',
            observacoes: `Pedido #${pedido.id} | Afiliado: ${pedido.afiliadoId || 'Direto'}`
        };

        const url = `https://api.tiny.com.br/public-api/v3/pedidos`;

        // 4. Envio com Header de Autorização
        const response = await axios.post(url, dadosPedido, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        // Na V3, o sucesso geralmente vem em formatos de status HTTP (201 Created)
        if (response.status === 201 || response.data.status === 'OK') {
            console.log(`✅ Pedido #${pedido.id} integrado ao Tiny V3!`);
            return { sucesso: true, tinyId: response.data.data?.id };
        }

    } catch (error) {
        console.error("❌ Erro na API V3 do Tiny:", error.response?.data || error.message);
        return { sucesso: false, erro: error.response?.data || error.message };
    }
}

module.exports = { enviarPedidoParaTiny };