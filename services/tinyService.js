const axios = require('axios');
const { getValidToken } = require('./tinyAuth');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// =================================================================
// 🕵️ FUNÇÃO AUXILIAR: BUSCAR OU CRIAR CLIENTE (CORRIGIDA V3)
// =================================================================
async function resolverCliente(pedido, token) {
    const cpfLimpo = (pedido.clienteDoc || '').replace(/\D/g, '');
    const nome = pedido.clienteNome;
    
    // 1. TENTATIVA: BUSCAR POR CPF
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

    // 2. TENTATIVA: CRIAR (Agora com a estrutura aninhada correta)
    try {
        const payloadCliente = {
            nome: nome,
            cpfCnpj: cpfLimpo,
            tipoPessoa: cpfLimpo.length > 11 ? 'J' : 'F',
            situacao: "A",
            fone: pedido.clienteTelefone,
            email: pedido.clienteEmail,
            
            // 🔴 AQUI ESTAVA O ERRO: O endereço tem que ser um OBJETO
            endereco: {
                endereco: pedido.clienteEndereco,       // Rua
                numero: pedido.clienteNumero || "S/N",
                complemento: "",
                bairro: pedido.clienteBairro || "Centro",
                cep: (pedido.clienteCep || "").replace(/\D/g, ''),
                municipio: pedido.clienteCidade || "Maceio", // Na doc é 'municipio'
                uf: pedido.clienteUf || "AL",
                pais: "Brasil"
            }
        };

        const resCriar = await axios.post(
            `https://api.tiny.com.br/public-api/v3/contatos`, 
            payloadCliente, 
            { headers: { 'Authorization': `Bearer ${token}` } }
        );
        return resCriar.data.data?.id || resCriar.data.id;

    } catch (error) {
        console.log("⚠️ Erro ao criar cliente (pode já existir). Buscando por nome...");
        // Log para você ver o erro real se precisar
        if(error.response) console.log("Detalhe Erro Tiny:", JSON.stringify(error.response.data));

        try {
            const resBuscaNome = await axios.get(`https://api.tiny.com.br/public-api/v3/contatos?pesquisa=${encodeURIComponent(nome)}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            return resBuscaNome.data.data?.[0]?.id;
        } catch (e) { return null; }
    }
}

// =================================================================
// 🚀 FUNÇÃO PRINCIPAL: ENVIAR PEDIDO (VERSÃO FINAL V3)
// =================================================================
async function enviarPedidoParaTiny(pedido) {
    try {
        console.log(`🤖 Service: Iniciando envio do Pedido #${pedido.id}...`);
        
        const token = await getValidToken();

        // 1. Resolve Cliente
        const idContato = await resolverCliente(pedido, token);
        if (!idContato) throw new Error("Não foi possível identificar o cliente no Tiny.");

        // 2. Prepara Itens e Calcula Soma Base
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

        // 3. MATEMÁTICA DOS JUROS
        const totalPagoNoCartao = parseFloat(pedido.valorTotal); 
        const valorFrete = 0; 

        let diferenca = parseFloat((totalPagoNoCartao - (somaProdutosBase + valorFrete)).toFixed(2));

        let valorOutrasDespesas = diferenca > 0 ? diferenca : 0;
        let valorDesconto = diferenca < 0 ? Math.abs(diferenca) : 0;

        console.log(`🧮 Auditoria Tiny: Pago(R$${totalPagoNoCartao}) - Soma(R$${somaProdutosBase}) = Dif(R$${diferenca})`);

        // 4. Monta Payload V3 (COM A CORREÇÃO DO ENDEREÇO)
        const payload = {
            data: new Date().toISOString().split('T')[0],
            idContato: idContato,
            itens: itensFormatados,
            naturezaOperacao: { id: 335900648 },
            valorFrete: valorFrete,
            valorOutrasDespesas: valorOutrasDespesas, 
            valorDesconto: valorDesconto, 
            
            situacao: 1, // 1 = Aberto
            obs: `Pedido #${pedido.id}. Pagamento: ${pedido.metodoPagamento}. Total Pago: R$ ${totalPagoNoCartao}`,

            // 🚨 AQUI ESTÁ A DIFERENÇA CRUCIAL:
            enderecoEntrega: {
                tipoPessoa: (pedido.clienteDoc && pedido.clienteDoc.length > 11) ? "J" : "F",
                cpfCnpj: (pedido.clienteDoc || "").replace(/\D/g, ''),
                endereco: pedido.clienteEndereco,
                numero: pedido.clienteNumero || "S/N",
                complemento: "",
                bairro: pedido.clienteBairro || "Centro",
                cep: (pedido.clienteCep || "00000000").replace(/\D/g, ''),
                municipio: pedido.clienteCidade || "Maceio", // Correto: municipio
                uf: pedido.clienteUf || "AL",
                pais: "Brasil" // Correto: pais
            }
        };

        // 5. Envia
        const response = await axios.post(
            `https://api.tiny.com.br/public-api/v3/pedidos`, 
            payload,
            { headers: { 'Authorization': `Bearer ${token}` } }
        );

        // Tratamento robusto da resposta (pode vir em .data ou .data.data)
        const dadosResposta = response.data.data || response.data;
        const idTinyPedido = dadosResposta?.id;
        const numeroTiny = dadosResposta?.numero;

        if (!idTinyPedido) {
            console.error("❌ Tiny respondeu sem ID:", JSON.stringify(response.data));
            throw new Error("Erro ao obter ID do pedido no Tiny.");
        }

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

module.exports = { enviarPedidoParaTiny };