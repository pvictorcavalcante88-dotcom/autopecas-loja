const axios = require('axios');

const TINY_TOKEN = process.env.TINY_TOKEN;

async function enviarPedidoParaTiny(pedido) {
    // 1. Tratamento dos itens (No seu banco eles são String JSON)
    const listaItens = typeof pedido.itens === 'string' ? JSON.parse(pedido.itens) : pedido.itens;

    // 2. Monta o JSON no formato do Tiny
    const dadosPedido = {
        pedido: {
            data_pedido: new Date(pedido.createdAt).toLocaleDateString('pt-BR'),
            cliente: {
                nome: pedido.clienteNome,
                cpf_cnpj: pedido.clienteDoc, // Usando o clienteDoc que já temos no checkout
                fone: pedido.clienteTelefone,
                email: pedido.clienteEmail,
                // Como você salva o endereço completo em uma string, mandamos tudo para 'endereco'
                endereco: pedido.clienteEndereco, 
            },
            itens: listaItens.map(item => ({
                item: {
                    codigo: item.referencia || item.id.toString(), // SKU/Referência que o Tiny entende
                    descricao: item.nome,
                    unidade: "UN",
                    qtd: item.qtd,
                    valor_unitario: item.unitario
                }
            })),
            forma_pagamento: pedido.metodoPagamento === 'PIX' ? 'Pix' : 'Cartão',
            obs: `Pedido #${pedido.id} | Afiliado: ${pedido.afiliadoId || 'Direto'} | Comissão: R$ ${pedido.comissaoGerada.toFixed(2)}`
        }
    };

    try {
        const url = `https://api.tiny.com.br/api2/pedido.incluir.php`;
        
        const params = new URLSearchParams();
        params.append('token', TINY_TOKEN);
        params.append('pedido', JSON.stringify(dadosPedido));
        params.append('formato', 'json');

        const response = await axios.post(url, params);
        const retorno = response.data.retorno;

        if (retorno.status === 'OK') {
            console.log(`✅ Pedido #${pedido.id} integrado ao Tiny! ID Tiny: ${retorno.pedido.id}`);
            return { sucesso: true, tinyId: retorno.pedido.id };
        } else {
            console.error(`❌ Erro Tiny no Pedido #${pedido.id}:`, retorno.erros);
            return { sucesso: false, erro: retorno.erros };
        }

    } catch (error) {
        console.error("❌ Erro de conexão com Tiny:", error.message);
        return { sucesso: false, erro: error.message };
    }
}

module.exports = { enviarPedidoParaTiny };