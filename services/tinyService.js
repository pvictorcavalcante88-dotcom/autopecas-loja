const axios = require('axios');
const { getValidToken } = require('./tinyAuth'); // Mantém sua importação

async function enviarPedidoParaTiny(pedido) {
    try {
        // 1. Pega o token automático
        const token = await getValidToken();

        // 2. Tratamento dos itens
        const listaItens = typeof pedido.itens === 'string' ? JSON.parse(pedido.itens) : pedido.itens;

        // ============================================================
        // 🟢 CÁLCULO DE JUROS PARA O TINY (Diferença entre Total e Produtos)
        // ============================================================
        let somaProdutos = 0;
        
        // Mapeia os itens e já calcula a soma dos produtos
        const itensMapeados = listaItens.map(item => {
            const qtd = parseFloat(item.qtd || item.quantidade);
            const unitario = parseFloat(item.unitario || item.valor_unitario);
            
            somaProdutos += (qtd * unitario);

            return {
                id_produto: item.tinyId ? parseInt(item.tinyId) : null, // Se tiver ID do Tiny, melhor usar
                codigo: item.referencia || item.id.toString(),
                descricao: item.nome,
                quantidade: qtd,
                valor_unitario: unitario,
                unidade: "UN",
                tipo: "P" // P = Produto
            };
        });

        // O valor total que o cliente pagou (incluindo juros do cartão)
        const valorTotalPago = parseFloat(pedido.valorTotal);
        
        // Calcula a diferença (Juros) para lançar como "Outras Despesas"
        let valorOutrasDespesas = 0;
        
        // Pequena margem de segurança (0.05) para evitar diferenças de arredondamento de centavos
        if (valorTotalPago > (somaProdutos + 0.05)) {
            valorOutrasDespesas = valorTotalPago - somaProdutos;
            console.log(`💰 Juros detectado: R$ ${valorOutrasDespesas.toFixed(2)} (Indo para o Tiny como Outras Despesas)`);
        }

        // 3. Monta o JSON no formato EXATO da API V3
        const dadosPedido = {
            data_pedido: new Date(pedido.createdAt || new Date()).toISOString().split('T')[0],
            
            cliente: {
                nome: pedido.clienteNome,
                tipo_pessoa: pedido.clienteDoc.length > 11 ? 'J' : 'F',
                cpf_cnpj: pedido.clienteDoc.replace(/\D/g, ''),
                fone: pedido.clienteTelefone,
                email: pedido.clienteEmail,
                endereco: pedido.clienteEndereco,
                numero: pedido.clienteNumero || "S/N", // Garante que não vá vazio
                bairro: pedido.clienteBairro || "Centro",
                cep: pedido.clienteCep || "00000000",
                cidade: pedido.clienteCidade || "Maceio",
                uf: pedido.clienteUf || "AL"
            },
            
            itens: itensMapeados,
            
            // 🟢 AQUI VAI O JUROS DO CARTÃO
            valor_outras_despesas: parseFloat(valorOutrasDespesas.toFixed(2)),

            // 🟢 CORREÇÃO CRÍTICA: Situação na V3 deve ser Inteiro (1 = Aberto)
            // Antes estava "aberto" (string), por isso dava erro.
            situacao: 1, 

            obs: `Pedido #${pedido.id} via Vunn. Pagamento: ${pedido.metodoPagamento}`
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

        // Na V3, o sucesso retorna status 201 (Created) ou 200 (OK)
        if (response.status === 201 || response.status === 200) {
            console.log(`✅ Sucesso na V3! ID Tiny: ${response.data.data?.id}`);
            return { sucesso: true, tinyId: response.data.data?.id };
        }

    } catch (error) {
        // Log detalhado para a gente não ficar no escuro
        const erroDetalhado = error.response?.data || error.message;
        console.error("❌ Erro na API V3:", JSON.stringify(erroDetalhado, null, 2)); // JSON.stringify bonito
        return { sucesso: false, erro: erroDetalhado };
    }
}

module.exports = { enviarPedidoParaTiny };