const axios = require('axios');
const { getValidToken } = require('./tinyAuth'); 
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ... (Mantenha a função resolverCliente IGUAL, pois ela já está perfeita) ...
// (Estou omitindo aqui para economizar espaço, mas deixe ela lá)

async function resolverCliente(pedido, token) {
    // ... COPIE A FUNÇÃO RESOLVER CLIENTE DA RESPOSTA ANTERIOR ...
    // ... Ela está funcionando bem para o endereço ...
    const cpfLimpo = (pedido.clienteDoc || '').replace(/\D/g, '');
    const nome = pedido.clienteNome;
    // ... (resto da lógica de cliente) ...
    // Se precisar eu colo ela inteira de novo, mas é a mesma.
    
    // 👇 VERSÃO RESUMIDA DA RESOLVER CLIENTE PARA TESTE RÁPIDO SE QUISER
    const dadosCliente = {
        nome: nome, cpfCnpj: cpfLimpo, tipoPessoa: cpfLimpo.length > 11 ? 'J' : 'F', situacao: "A", fone: pedido.clienteTelefone, email: pedido.clienteEmail,
        endereco: { endereco: pedido.clienteEndereco, numero: pedido.clienteNumero || "S/N", bairro: pedido.clienteBairro || "Centro", municipio: pedido.clienteCidade || "Maceio", cep: (pedido.clienteCep || "").replace(/\D/g, ''), uf: pedido.clienteUf || "AL", pais: "Brasil" }
    };
    try {
        const res = await axios.get(`https://api.tiny.com.br/public-api/v3/contatos?cpf_cnpj=${cpfLimpo}`, { headers: { 'Authorization': `Bearer ${token}` } });
        if(res.data.data?.[0]?.id) return res.data.data[0].id; // Retorna se achar
        const resCriar = await axios.post(`https://api.tiny.com.br/public-api/v3/contatos`, dadosCliente, { headers: { 'Authorization': `Bearer ${token}` } });
        return resCriar.data.data?.id || resCriar.data.id;
    } catch(e) { return null; }
}


// =================================================================
// 🚀 ENVIAR PEDIDO (AGORA MUITO MAIS SIMPLES)
// =================================================================
async function enviarPedidoParaTiny(pedido) {
    try {
        console.log(`🤖 Service: Processando Pedido (IDs Sincronizados)...`);
        const token = await getValidToken();

        const idContato = await resolverCliente(pedido, token);
        if (!idContato) throw new Error("Erro no Cliente Tiny.");
        
        await sleep(1000);

        const listaItens = typeof pedido.itens === 'string' ? JSON.parse(pedido.itens) : pedido.itens;
        let somaProdutosBase = 0;

        const itensFormatados = listaItens.map(item => {
            
            // 🔥 COMO O ID AGORA É IGUAL, É SÓ MANDAR O ID! 🔥
            // O front manda item.id (que é 84930219). O Tiny espera 84930219.
            // Acabou a confusão!
            
            const idReal = parseInt(item.id); 
            
            const qtd = parseFloat(item.qtd || item.quantidade || 1);
            const unitario = parseFloat(item.preco || item.unitario || 0);
            somaProdutosBase += (qtd * unitario);

            console.log(`   ✅ Item: ${idReal} | Qtd: ${qtd}`);

            return {
                produto: { id: idReal }, // Simples assim!
                quantidade: qtd,
                valorUnitario: unitario > 0 ? unitario : 0.01
            };
        });

        const totalPago = parseFloat(pedido.valorTotal); 
        const diferenca = parseFloat((totalPago - somaProdutosBase).toFixed(2));
        const valorOutrasDespesas = diferenca > 0.05 ? diferenca : 0;
        const valorDesconto = diferenca < -0.05 ? Math.abs(diferenca) : 0;

        const payload = {
            data: new Date().toISOString().split('T')[0],
            idContato: idContato,
            itens: itensFormatados,
            naturezaOperacao: { id: 335900648 },
            valorFrete: 0,
            valorOutrasDespesas: valorOutrasDespesas, 
            valorDesconto: valorDesconto,
            situacao: 1, 
            obs: `Pedido Site. Pagamento: ${pedido.metodoPagamento}.`,
            enderecoEntrega: {
                tipoPessoa: (pedido.clienteDoc && pedido.clienteDoc.length > 11) ? "J" : "F",
                cpfCnpj: (pedido.clienteDoc || "").replace(/\D/g, ''),
                endereco: pedido.clienteEndereco,
                numero: pedido.clienteNumero || "S/N",
                bairro: pedido.clienteBairro || "Centro",
                municipio: pedido.clienteCidade || "Maceio", 
                cep: (pedido.clienteCep || "").replace(/\D/g, ''),
                uf: pedido.clienteUf || "AL",
                pais: "Brasil"
            }
        };

        const response = await axios.post(`https://api.tiny.com.br/public-api/v3/pedidos`, payload, { headers: { 'Authorization': `Bearer ${token}` } });
        
        const dados = response.data.data || response.data;
        console.log(`✅ Pedido Criado no Tiny: ${dados.numero}`);
        
        return { success: true, tinyId: dados.id, numero: dados.numero };

    } catch (error) {
        const msg = error.response?.data?.detalhes || error.response?.data || error.message;
        console.error("❌ Erro Service Tiny:", JSON.stringify(msg, null, 2));
        return { success: false, erro: msg };
    }
}

module.exports = { enviarPedidoParaTiny };