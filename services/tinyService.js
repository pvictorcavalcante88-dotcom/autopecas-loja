const axios = require('axios');
const { getValidToken } = require('./tinyAuth');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// =================================================================
// 🕵️ FUNÇÃO 1: RESOLVER CLIENTE (BUSCAR -> SE EXISTIR, ATUALIZA)
// =================================================================
async function resolverCliente(pedido, token) {
    const cpfLimpo = (pedido.clienteDoc || '').replace(/\D/g, '');
    const nome = pedido.clienteNome;

    const dadosCliente = {
        nome: nome,
        cpfCnpj: cpfLimpo,
        tipoPessoa: cpfLimpo.length > 11 ? 'J' : 'F',
        situacao: "A",
        fone: pedido.clienteTelefone,
        email: pedido.clienteEmail,
        endereco: {
            endereco: pedido.clienteEndereco,
            numero: pedido.clienteNumero || "S/N",
            bairro: pedido.clienteBairro || "Centro",
            municipio: pedido.clienteCidade || "Maceio",
            cep: (pedido.clienteCep || "").replace(/\D/g, ''),
            uf: pedido.clienteUf || "AL",
            pais: "Brasil"
        }
    };

    // LOG PARA VER SE O DADO CHEGOU AQUI
    console.log("📦 DADOS PRONTOS PARA O TINY:", JSON.stringify(dadosCliente.endereco, null, 2));

    // ... lógica de busca por CPF ...

    // TENTATIVA DE CRIAÇÃO (Se cair aqui, queremos ver o erro)
    try {
        const resCriar = await axios.post(
            `https://api.tiny.com.br/public-api/v3/contatos`, 
            dadosCliente, 
            { headers: { 'Authorization': `Bearer ${token}` } }
        );
        return resCriar.data.data?.id || resCriar.data.id;

    } catch (error) {
        // 🔥 AQUI ESTÁ O QUE PRECISAMOS VER
        console.error("❌ O TINY REJEITOU! MOTIVO:", JSON.stringify(error.response?.data || error.message, null, 2));
        
        // ... fallback da busca por nome ...
        return null; // Retorne null para forçar o erro e não tentar buscar nome agora
    }
}

// =================================================================
// 🚀 FUNÇÃO 2: ENVIAR PEDIDO
// =================================================================
async function enviarPedidoParaTiny(pedido) {
    try {
        console.log(`🤖 Service: Iniciando envio do Pedido #${pedido.id}...`);
        
        const token = await getValidToken();

        // 1. Resolve (e agora ATUALIZA) o Cliente
        const idContato = await resolverCliente(pedido, token);
        if (!idContato) throw new Error("Não foi possível identificar o cliente no Tiny.");

        // 2. Prepara Itens
        const listaItens = typeof pedido.itens === 'string' ? JSON.parse(pedido.itens) : pedido.itens;
        let somaProdutosBase = 0;

        const itensFormatados = await Promise.all(listaItens.map(async (item) => {
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

        // 3. Cálculos Financeiros
        const totalPagoNoCartao = parseFloat(pedido.valorTotal); 
        const valorFrete = 0; 
        let diferenca = parseFloat((totalPagoNoCartao - (somaProdutosBase + valorFrete)).toFixed(2));
        let valorOutrasDespesas = diferenca > 0 ? diferenca : 0;
        let valorDesconto = diferenca < 0 ? Math.abs(diferenca) : 0;

        // 4. Monta Payload do Pedido V3
        const payload = {
            data: new Date().toISOString().split('T')[0],
            idContato: idContato,
            itens: itensFormatados,
            naturezaOperacao: { id: 335900648 },
            valorFrete: valorFrete,
            valorOutrasDespesas: valorOutrasDespesas, 
            valorDesconto: valorDesconto, 
            situacao: 1, // 1 = Aberto
            obs: `Pedido #${pedido.id}. Pagamento: ${pedido.metodoPagamento}.`,

            // Reforço: Mandamos o endereço também no pedido para garantir a NFe
            enderecoEntrega: {
                tipoPessoa: (pedido.clienteDoc && pedido.clienteDoc.length > 11) ? "J" : "F",
                cpfCnpj: (pedido.clienteDoc || "").replace(/\D/g, ''),
                endereco: pedido.clienteEndereco,
                numero: pedido.clienteNumero || "S/N",
                complemento: "",
                bairro: pedido.clienteBairro || "Centro",
                municipio: pedido.clienteCidade || "Maceio", 
                cep: (pedido.clienteCep || "00000000").replace(/\D/g, ''),
                uf: pedido.clienteUf || "AL",
                pais: "Brasil"
            }
        };

        // 5. Envia Pedido
        const response = await axios.post(
            `https://api.tiny.com.br/public-api/v3/pedidos`, 
            payload,
            { headers: { 'Authorization': `Bearer ${token}` } }
        );

        const dadosResposta = response.data.data || response.data;
        const idTinyPedido = dadosResposta?.id;
        const numeroTiny = dadosResposta?.numero;

        console.log(`✅ Sucesso Tiny! ID: ${idTinyPedido} | Nota: ${numeroTiny}`);

        // 6. Atualiza Banco Local
        await prisma.pedido.update({
            where: { id: pedido.id },
            data: { tinyId: String(idTinyPedido), numeroNota: String(numeroTiny) }
        });

        return { success: true, tinyId: idTinyPedido };

    } catch (error) {
        const msg = error.response?.data?.detalhes || error.response?.data || error.message;
        console.error("❌ Erro Service Tiny:", JSON.stringify(msg, null, 2));
        return { success: false, erro: msg };
    }
}

module.exports = { enviarPedidoParaTiny };