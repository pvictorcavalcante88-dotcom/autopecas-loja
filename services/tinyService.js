const axios = require('axios');
const { getValidToken } = require('./tinyAuth'); // Ajuste o caminho se necessário
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// =================================================================
// 🕵️ FUNÇÃO AUXILIAR: BUSCAR OU CRIAR CLIENTE (BLINDADA)
// =================================================================
async function resolverCliente(pedido, token) {
    const cpfLimpo = (pedido.clienteDoc || '').replace(/\D/g, '');
    const nome = pedido.clienteNome;
    
    // 1. TENTATIVA: CRIAR
    try {
        const payloadCliente = {
            nome: nome,
            cpfCnpj: cpfLimpo,
            tipoPessoa: cpfLimpo.length > 11 ? 'J' : 'F',
            situacao: "A",
            fone: pedido.clienteTelefone,
            email: pedido.clienteEmail,
            endereco: pedido.clienteEndereco,
            numero: pedido.clienteNumero || "S/N",
            bairro: pedido.clienteBairro || "",
            cep: pedido.clienteCep || "",
            cidade: pedido.clienteCidade || "",
            uf: pedido.clienteUf || ""
        };

        const resCriar = await axios.post(
            `https://api.tiny.com.br/public-api/v3/contatos`, 
            payloadCliente, 
            { headers: { 'Authorization': `Bearer ${token}` } }
        );
        return resCriar.data.data?.id || resCriar.data.id;

    } catch (error) {
        // Se der erro (ex: cliente já existe), tentamos buscar
        console.log("⚠️ Cliente já existe ou erro na criação. Buscando ID...");
    }

    // 2. TENTATIVA: BUSCAR POR CPF
    if (cpfLimpo) {
        try {
            const resBusca = await axios.get(`https://api.tiny.com.br/public-api/v3/contatos?cpf_cnpj=${cpfLimpo}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (resBusca.data.data && resBusca.data.data.length > 0) {
                return resBusca.data.data[0].id;
            }
        } catch (e) {}
    }

    // 3. TENTATIVA: BUSCAR POR NOME
    try {
        const resBuscaNome = await axios.get(`https://api.tiny.com.br/public-api/v3/contatos?pesquisa=${encodeURIComponent(nome)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (resBuscaNome.data.data && resBuscaNome.data.data.length > 0) {
            return resBuscaNome.data.data[0].id;
        }
    } catch (e) {}

    return null;
}

// =================================================================
// 🚀 FUNÇÃO PRINCIPAL: ENVIAR PEDIDO
// =================================================================
async function enviarPedidoParaTiny(pedido) {
    try {
        console.log(`🤖 Service: Iniciando envio do Pedido #${pedido.id}...`);
        
        // 1. Pega Token
        const token = await getValidToken();

        // 2. Resolve Cliente
        const idContato = await resolverCliente(pedido, token);
        if (!idContato) {
            throw new Error("Não foi possível identificar o cliente no Tiny.");
        }

        // 3. Prepara Itens e Calcula Soma Base
        const listaItens = typeof pedido.itens === 'string' ? JSON.parse(pedido.itens) : pedido.itens;
        let somaProdutosBase = 0;

        const itensFormatados = await Promise.all(listaItens.map(async (item) => {
            // Tenta achar o ID Tiny do produto no banco para garantir vínculo
            let idTinyProduto = item.tinyId;
            
            if (!idTinyProduto && item.id) {
                const prodDb = await prisma.produto.findUnique({ where: { id: parseInt(item.id) } });
                if (prodDb) idTinyProduto = prodDb.tinyId;
            }
            
            // Fallback: Se não tiver tinyId, usa o ID local como string (o Tiny pode reclamar, mas tenta)
            const idFinal = idTinyProduto || String(item.id || item.produtoId);

            const qtd = parseFloat(item.qtd || item.quantidade || 1);
            const unitario = parseFloat(item.unitario || item.valor_unitario || 0);
            
            somaProdutosBase += (qtd * unitario);

            return {
                produto: { id: String(idFinal) }, // Formato V3 exige objeto produto
                quantidade: qtd,
                valorUnitario: unitario
            };
        }));

        // 4. MÁGICA DOS JUROS (Cálculo da Diferença)
        let valorOutrasDespesas = 0;
        let valorDesconto = 0;
        const totalPagoNoCartao = parseFloat(pedido.valorTotal);
        // Se você salvar o frete no pedido, use aqui. Se não, assume 0.
        const valorFrete = 0; 

        // Diferença = O que o cliente pagou - (Soma dos produtos + Frete)
        const diferenca = totalPagoNoCartao - (somaProdutosBase + valorFrete);

        if (diferenca > 0.05) {
            valorOutrasDespesas = parseFloat(diferenca.toFixed(2));
            console.log(`💰 Juros Detectados: R$ ${valorOutrasDespesas}`);
        } else if (diferenca < -0.05) {
            valorDesconto = parseFloat(Math.abs(diferenca).toFixed(2));
            console.log(`📉 Desconto Detectado: R$ ${valorDesconto}`);
        }

        // 5. Monta Payload V3
        const payload = {
            data: new Date(pedido.createdAt).toISOString().split('T')[0],
            idContato: idContato,
            itens: itensFormatados,
            naturezaOperacao: { id: 335900648 },
            valorFrete: valorFrete,
            
            // Aqui entram os juros ou descontos calculados
            valorOutrasDespesas: valorOutrasDespesas, 
            valorDesconto: valorDesconto,             
            
            situacao: 0, // 0 = Em aberto (sua preferência)
            obs: `Pedido #${pedido.id} via Site. Pagamento: ${pedido.metodoPagamento || 'PIX'}`
        };

        // 6. Envia
        const response = await axios.post(
            `https://api.tiny.com.br/public-api/v3/pedidos`, 
            payload,
            { headers: { 'Authorization': `Bearer ${token}` } }
        );

        const idTinyPedido = response.data.data?.id || response.data.id;
        const numeroTiny = response.data.data?.numero || response.data.numero;

        console.log(`✅ Sucesso Webhook! Tiny ID: ${idTinyPedido} (Nota: ${numeroTiny})`);

        // 7. Salva o ID do Tiny no seu banco para referência futura
        await prisma.pedido.update({
            where: { id: pedido.id },
            data: { tinyId: String(idTinyPedido), notaFiscal: String(numeroTiny) }
        });

        return { success: true, tinyId: idTinyPedido };

    } catch (error) {
        const msg = error.response?.data?.detalhes || error.response?.data || error.message;
        console.error("❌ Erro Service Tiny:", JSON.stringify(msg, null, 2));
        return { success: false, erro: msg };
    }
}

module.exports = { enviarPedidoParaTiny };