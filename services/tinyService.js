const axios = require('axios');
const { getValidToken } = require('./tinyAuth');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// =================================================================
// 🕵️ FUNÇÃO AUXILIAR: BUSCAR OU CRIAR CLIENTE (BLINDADA)
// =================================================================
async function resolverCliente(pedido, token) {
    const cpfLimpo = (pedido.clienteDoc || '').replace(/\D/g, '');
    const nome = pedido.clienteNome;
    
    // 1. TENTATIVA: BUSCAR POR CPF (Mais rápido e seguro)
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

    // 2. TENTATIVA: CRIAR
    try {
        const payloadCliente = {
            nome: nome,
            cpfCnpj: cpfLimpo,
            tipoPessoa: cpfLimpo.length > 11 ? 'J' : 'F',
            situacao: "A",
            fone: pedido.clienteTelefone,
            email: pedido.clienteEmail,
            endereco: pedido.clienteEndereco,
            numero: "S/N", // Campo obrigatório
            bairro: "Bairro", // Campo obrigatório
            cep: "00000000",
            cidade: "Cidade",
            uf: "UF"
        };

        const resCriar = await axios.post(
            `https://api.tiny.com.br/public-api/v3/contatos`, 
            payloadCliente, 
            { headers: { 'Authorization': `Bearer ${token}` } }
        );
        return resCriar.data.data?.id || resCriar.data.id;

    } catch (error) {
        // Se falhar a criação (ex: duplicado), busca por nome como última chance
        console.log("⚠️ Cliente já existe ou erro. Buscando por nome...");
        try {
            const resBuscaNome = await axios.get(`https://api.tiny.com.br/public-api/v3/contatos?pesquisa=${encodeURIComponent(nome)}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            return resBuscaNome.data.data?.[0]?.id;
        } catch (e) { return null; }
    }
}

// =================================================================
// 🚀 FUNÇÃO PRINCIPAL: ENVIAR PEDIDO
// =================================================================
async function enviarPedidoParaTiny(pedido) {
    try {
        console.log(`🤖 Service: Iniciando envio do Pedido #${pedido.id}...`);
        
        const token = await getValidToken();

        // 1. Resolve Cliente
        const idContato = await resolverCliente(pedido, token);
        if (!idContato) throw new Error("Não foi possível identificar o cliente no Tiny.");

        // 2. Prepara Itens e Calcula Soma Base dos Produtos
        const listaItens = typeof pedido.itens === 'string' ? JSON.parse(pedido.itens) : pedido.itens;
        let somaProdutosBase = 0;

        const itensFormatados = await Promise.all(listaItens.map(async (item) => {
            // Lógica para garantir ID do produto
            let idFinal = item.tinyId;
            if (!idFinal && item.id) {
                const prodDb = await prisma.produto.findUnique({ where: { id: parseInt(item.id) } });
                if (prodDb) idFinal = prodDb.tinyId;
            }
            if (!idFinal) idFinal = String(item.id || item.produtoId);

            const qtd = parseFloat(item.qtd || item.quantidade || 1);
            const unitario = parseFloat(item.unitario || item.valor_unitario || 0);
            
            somaProdutosBase += (qtd * unitario);

            return {
                produto: { id: String(idFinal) },
                quantidade: qtd,
                valorUnitario: unitario
            };
        }));

        // 3. MATEMÁTICA DOS JUROS (A Correção)
        // Pegamos o valor total que o Asaas cobrou (com juros)
        const totalPagoNoCartao = parseFloat(pedido.valorTotal); 
        const valorFrete = 0; // Se tiver frete, coloque aqui

        // Diferença = Total Pago - (Soma Produtos + Frete)
        let diferenca = totalPagoNoCartao - (somaProdutosBase + valorFrete);
        
        // Arredonda para 2 casas decimais para evitar bugs de 0.0000001
        diferenca = parseFloat(diferenca.toFixed(2));

        let valorOutrasDespesas = 0;
        let valorDesconto = 0;

        console.log(`🧮 Auditoria Tiny: Pago(R$${totalPagoNoCartao}) - SomaItens(R$${somaProdutosBase}) = Dif(R$${diferenca})`);

        if (diferenca > 0) {
            valorOutrasDespesas = diferenca;
            console.log(`💰 JUROS APLICADO: R$ ${valorOutrasDespesas}`);
        } else if (diferenca < 0) {
            valorDesconto = Math.abs(diferenca);
            console.log(`📉 DESCONTO APLICADO: R$ ${valorDesconto}`);
        }

        // 4. Monta Payload V3
        const payload = {
            data: new Date().toISOString().split('T')[0],
            idContato: idContato,
            itens: itensFormatados,
            naturezaOperacao: { id: 335900648 },
            valorFrete: valorFrete,
            
            // Campos cruciais para o valor bater
            valorOutrasDespesas: valorOutrasDespesas, 
            valorDesconto: valorDesconto,             
            
            situacao: 0, // 0 = Em aberto
            obs: `Pedido #${pedido.id}. Pagamento: ${pedido.metodoPagamento}. Total Pago: R$ ${totalPagoNoCartao}`
        };

        // 5. Envia
        const response = await axios.post(
            `https://api.tiny.com.br/public-api/v3/pedidos`, 
            payload,
            { headers: { 'Authorization': `Bearer ${token}` } }
        );

        const idTinyPedido = response.data.data?.id || response.data.id;
        const numeroTiny = response.data.data?.numero || response.data.numero;

        console.log(`✅ Sucesso Tiny! ID: ${idTinyPedido} | Nota: ${numeroTiny}`);

        // 6. Atualiza Banco Local
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