require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const qs = require('querystring');
const axios = require('axios');
const { getValidToken } = require('./services/tinyAuth');
const { enviarPedidoParaTiny } = require('./services/tinyService');
const path = require('path'); 
const multer = require('multer');
const fs = require('fs');
const app = express();


// ==============================================================
// 1. CONFIGURAÇÃO DOS ENDEREÇOS PERMITIDOS (CORS)
// ==============================================================
const allowedOrigins = [
    'https://vunn.com.br',
    'https://www.vunn.com.br',
    'http://vunn.com.br',      // Backup sem SSL
    'http://www.vunn.com.br',   // Backup sem SSL
    'https://autopecas-loja.onrender.com',
    'https://nimble-bublanina-1395f3.netlify.app',
    'http://127.0.0.1:5500'                   // Teste Local (React/Node)
];

app.use(cors({
  origin: function (origin, callback) {
    // permite solicitações sem origem (como aplicativos móveis ou solicitações curl)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'A política CORS para este site não permite acesso da origem informada.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// ... resto do código (rotas, app.listen, etc) ...

// ==============================================================
// 📊 CONFIGURAÇÃO DE TAXAS E IMPOSTOS (ATUALIZADO)
// ==============================================================
const CONFIG_FINANCEIRA = {
    impostoGoverno: 0.06,        // 6% (Simples Nacional)
    taxaAsaasPix: 0.99,          // R$ 0,99 fixo por Pix
    taxaAsaasCartaoPct: 0.055,   // 5.5% (Cobre Crédito + Antecipação)
    taxaAsaasCartaoFixo: 0.49    // R$ 0,49 fixo por transação
};

const { criarCobrancaPixDireto, criarLinkPagamento } = require('./services/asaasService');

const prisma = new PrismaClient();
app.use(express.json());

// =================================================================
// 🌐 SERVIR O SITE (FRONTEND)
// =================================================================
app.use(express.static(path.join(__dirname, '.'))); 
app.use('/uploads', express.static('uploads'));

const SECRET_KEY = "SEGREDO_SUPER_SECRETO"; 

// =================================================================
// 🛡️ MIDDLEWARE DE SEGURANÇA
// =================================================================
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.sendStatus(401);

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
}

// Configuração de Uploads
if (!fs.existsSync('uploads')) { fs.mkdirSync('uploads'); }

const storage = multer.diskStorage({
    destination: function (req, file, cb) { cb(null, 'uploads/') },
    filename: function (req, file, cb) { cb(null, Date.now() + path.extname(file.originalname)) }
});
const upload = multer({ storage: storage });

// =================================================================
// 🔑 ROTAS DE LOGIN
// =================================================================
app.post('/login', async (req, res) => {
    const { email, senha } = req.body;
    try {
        // Busca o admin no banco PostgreSQL que aparece no seu print
        const admin = await prisma.admin.findUnique({ where: { email } });

        if (!admin) {
            return res.status(401).json({ erro: "Credenciais inválidas" });
        }

        // Se estiver usando senhas seguras (recomendado):
        const senhaValida = await bcrypt.compare(senha, admin.senha);
        
        // Se ainda estiver testando com senha em texto puro:
        // const senhaValida = (senha === admin.senha);

        if (senhaValida) {
            const token = jwt.sign({ id: admin.id, role: 'admin' }, SECRET_KEY, { expiresIn: '12h' });
            return res.json({ token });
        }
        res.status(401).json({ erro: "Credenciais inválidas" });
    } catch (e) {
        console.error(e);
        res.status(500).json({ erro: "Erro interno no servidor" }); // É aqui que gera o erro do seu print
    }
});

app.post('/afiliado/login', async (req, res) => {
    const { telefone, senha } = req.body;
    try {
        const afiliado = await prisma.afiliado.findUnique({ where: { telefone } });
        if (!afiliado) return res.status(404).json({ erro: "Afiliado não encontrado" });
        
        if (afiliado.senha !== senha) return res.status(401).json({ erro: "Senha incorreta" });
        if (!afiliado.aprovado) return res.status(403).json({ erro: "Cadastro pendente" });

        const token = jwt.sign({ id: afiliado.id, role: 'afiliado' }, SECRET_KEY, { expiresIn: '30d' });
        
        res.json({ 
            token, 
            nome: afiliado.nome, 
            codigo: afiliado.codigo,
            margem: afiliado.margem,
            telefone: afiliado.telefone
        });
    } catch (error) { res.status(500).json({ erro: "Erro no servidor" }); }
});

// ============================================================
// 📝 ROTA: CADASTRO DE NOVO AFILIADO
// ============================================================
app.post('/afiliado/cadastro', async (req, res) => {
    try {
        const { nome, telefone, codigo, senha, chavePix } = req.body;

        // 1. Validações Básicas
        if (!nome || !telefone || !codigo || !senha) {
            return res.status(400).json({ erro: "Preencha os campos obrigatórios." });
        }

        // 2. Verifica se já existe esse telefone
        const existeTel = await prisma.afiliado.findUnique({ where: { telefone } });
        if (existeTel) return res.status(400).json({ erro: "Este telefone já está cadastrado." });

        // 3. Verifica se já existe esse código
        const existeCod = await prisma.afiliado.findUnique({ where: { codigo } });
        if (existeCod) return res.status(400).json({ erro: "Este código já está em uso. Escolha outro." });

        // 4. Cria o Afiliado (aprovado = false para você aprovar depois)
        await prisma.afiliado.create({
            data: {
                nome,
                telefone,
                codigo,
                senha,
                chavePix,
                aprovado: false, // <--- IMPORTANTE: Entra como pendente
                saldo: 0.0,
                margem: 0.0
            }
        });

        res.json({ success: true, mensagem: "Cadastro realizado! Aguarde aprovação." });

    } catch (e) {
        console.error("Erro Cadastro:", e);
        res.status(500).json({ erro: "Erro ao criar conta. Tente novamente." });
    }
});

// =================================================================
// 🔍 BUSCA DE PRODUTOS
// =================================================================
app.get('/search', async (req, res) => {
    try {
        const { q, categoria } = req.query;
        let whereClause = {};
        let condicoesAnd = [];

        if (categoria) {
            condicoesAnd.push({ 
                categoria: { contains: categoria, mode: 'insensitive' } 
            });
        }

        if (q) {
            const termos = q.trim().split(/\s+/);
            termos.forEach(termo => {
                condicoesAnd.push({
                    OR: [
                        { titulo: { contains: termo, mode: 'insensitive' } },
                        { referencia: { contains: termo, mode: 'insensitive' } },
                        { carros: { contains: termo, mode: 'insensitive' } },
                        { pesquisa: { contains: termo, mode: 'insensitive' } },
                        { fabricante: { contains: termo, mode: 'insensitive' } },
                        { categoria: { contains: termo, mode: 'insensitive' } },
                        { tags: { contains: termo, mode: 'insensitive' } }
                    ]
                });
            });
        }

        if (condicoesAnd.length > 0) whereClause.AND = condicoesAnd;

        const produtos = await prisma.produto.findMany({
            where: whereClause,
            take: 50
        });
        res.json(produtos);
    } catch (error) { 
        console.error("Erro busca:", error);
        res.json([]); 
    }
});

app.get('/products/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) return res.status(400).json({ erro: "ID inválido" });

        const produto = await prisma.produto.findUnique({ where: { id: id } });
        if (!produto) return res.status(404).json({ erro: "Produto não encontrado" });

        let listaRelacionados = [];
        if (produto.produtos_relacionados) {
            const ids = produto.produtos_relacionados.split(',')
                .map(num => parseInt(num.trim()))
                .filter(n => !isNaN(n));

            if (ids.length > 0) {
                listaRelacionados = await prisma.produto.findMany({
                    where: { id: { in: ids } },
                    select: { id: true, titulo: true, imagem: true, preco_novo: true, categoria: true } 
                });
            }
        }
        res.json({ ...produto, listaRelacionados });
    } catch (e) { res.status(500).json({ erro: "Erro no servidor" }); }
});

// =================================================================
// 🦊 ÁREA DO AFILIADO (ROTAS CORRIGIDAS)
// =================================================================

// 1. DASHBOARD COMPLETO (Corrigi o nome para mandar 'vendas')
app.get('/afiliado/dashboard', authenticateToken, async (req, res) => {
    try {
        const id = req.user.id; 
        const afiliado = await prisma.afiliado.findUnique({
            where: { id: id },
            include: {
                pedidos: { 
                    orderBy: { createdAt: 'desc' },
                    take: 50 
                }
            }
        });

        if (!afiliado) return res.status(404).json({ erro: "Afiliado não encontrado" });

        res.json({
            // Dados Básicos
            nome: afiliado.nome,
            codigo: afiliado.codigo, 
            saldo: afiliado.saldo,
            saldoDevedor: afiliado.saldoDevedor || 0.0,
            
            // Dados Bancários
            chavePix: afiliado.chavePix,
            banco: afiliado.banco,
            agencia: afiliado.agencia,
            conta: afiliado.conta,
            
            // 🟢 O QUE ESTAVA FALTANDO (ADICIONE ISSO):
            cpf: afiliado.cpf,
            endereco: afiliado.endereco,
            telefone: afiliado.telefone, 
            email: afiliado.email, // Se tiver email no banco
            
            // Vendas
            vendas: afiliado.pedidos 
        });

    } catch (e) {
        console.error("Erro Dashboard:", e);
        res.status(500).json({ erro: "Erro ao buscar dados" });
    }
});
// ============================================================
// ROTA CORRIGIDA PARA SALVAR ORÇAMENTOS
// ============================================================

// 1. O nome da rota TEM que ser '/afiliado/orcamentos' para bater com o script.js
app.post('/afiliado/orcamentos', authenticateToken, async (req, res) => {
    try {
        // 2. Adicionei 'clienteDoc' aqui para receber o CPF vindo do site
        const { nome, itens, total, clienteDoc } = req.body;
        const afiliadoId = req.user.id; 

        // Verificação de segurança para o JSON
        // Se 'itens' já vier como texto do localStorage, usamos direto. Se vier como objeto, transformamos.
        const itensString = typeof itens === 'string' ? itens : JSON.stringify(itens);

        const novo = await prisma.orcamento.create({
            data: { 
                nome, 
                itens: itensString, 
                total: parseFloat(total), 
                afiliadoId,
                // 3. Adicionei o campo no banco de dados
                clienteDoc: clienteDoc || null 
            }
        });

        res.json({ mensagem: "Salvo!", id: novo.id });

    } catch (e) { 
        console.error("Erro no backend:", e); // Mostra o erro no terminal se houver
        res.status(500).json({ erro: "Erro ao salvar." }); 
    }
});

app.get('/afiliado/orcamentos', authenticateToken, async (req, res) => {
    try {
        const orcamentos = await prisma.orcamento.findMany({
            where: { afiliadoId: req.user.id },
            orderBy: { createdAt: 'desc' }
        });
        res.json(orcamentos);
    } catch (e) { res.status(500).json({ erro: "Erro ao buscar orçamentos." }); }
});

app.delete('/orcamentos/:id', authenticateToken, async (req, res) => {
    try {
        await prisma.orcamento.deleteMany({ where: { id: parseInt(req.params.id), afiliadoId: req.user.id } });
        res.json({ mensagem: "Deletado" });
    } catch (e) { res.status(500).json({ erro: "Erro ao deletar." }); }
});

// 3. MEUS CLIENTES (CRM)
app.get('/afiliado/meus-clientes', authenticateToken, async (req, res) => {
    try {
        const afiliadoId = req.user.id; 
        const vendas = await prisma.pedido.findMany({
            where: { afiliadoId: afiliadoId },
            orderBy: { createdAt: 'desc' }
        });

        const clientesMap = new Map();
        vendas.forEach(venda => {
            if (!clientesMap.has(venda.clienteEmail)) {
                clientesMap.set(venda.clienteEmail, {
                    nome: venda.clienteNome,
                    email: venda.clienteEmail,
                    telefone: venda.clienteTelefone || "Não informado",
                    totalGasto: 0,
                    ultimaCompra: venda.createdAt,
                    pedidos: []
                });
            }
            const cliente = clientesMap.get(venda.clienteEmail);
            cliente.totalGasto += venda.valorTotal;
            cliente.pedidos.push({
                id: venda.id,
                data: venda.createdAt,
                valor: venda.valorTotal,
                status: venda.status
            });
        });
        res.json(Array.from(clientesMap.values()));
    } catch (e) { res.status(500).json({ erro: "Erro ao buscar clientes" }); }
});

// ============================================================
// 👥 GESTÃO DE CLIENTES (CADASTRO DO AFILIADO)
// ============================================================

// 1. Cadastrar Novo Cliente (PF ou PJ)
app.post('/afiliado/cadastrar-cliente', authenticateToken, async (req, res) => {
    try {
        const { nome, tipo, documento, telefone, email, endereco } = req.body;
        
        await prisma.clienteAfiliado.create({
            data: {
                nome, tipo, documento, telefone, email, endereco,
                afiliadoId: req.user.id
            }
        });
        
        res.json({ success: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ erro: "Erro ao cadastrar cliente." });
    }
});

// 2. Listar Clientes Cadastrados
app.get('/afiliado/meus-clientes-cadastrados', authenticateToken, async (req, res) => {
    try {
        const clientes = await prisma.clienteAfiliado.findMany({
            where: { afiliadoId: req.user.id },
            orderBy: { nome: 'asc' }
        });
        res.json(clientes);
    } catch (e) {
        res.status(500).json({ erro: "Erro ao buscar clientes." });
    }
});

// 4. ATUALIZAR PERFIL (Pix, Banco)
app.put('/afiliado/perfil', authenticateToken, async (req, res) => {
    try {
        const { chavePix, banco, agencia, conta } = req.body;
        await prisma.afiliado.update({
            where: { id: req.user.id },
            data: { chavePix, banco, agencia, conta }
        });
        res.json({ success: true });
    } catch(e) { res.status(500).json({ erro: "Erro ao atualizar perfil" }); }
});

app.put('/afiliado/perfil-completo', authenticateToken, async (req, res) => {
    const { id } = req.user; // Pega o ID do token
    const { nome, cpf, telefone, endereco, chavePix, banco, agencia, conta, senha } = req.body;

    // Validação Backend: Apenas o essencial para pagar é obrigatório
    if (!nome || !cpf || !telefone || !endereco || !chavePix) {
        return res.status(400).json({ erro: "Preencha os campos obrigatórios (Nome, CPF, Telefone, Endereço, Pix)." });
    }

    try {
        const dadosAtualizar = {
            nome, cpf, telefone, endereco, chavePix, banco, agencia, conta
            // Note que NÃO coloquei 'foto' aqui ainda (explico abaixo)
        };

        // Só atualiza a senha se o usuário digitou algo
        if (senha && senha.trim() !== "") {
            dadosAtualizar.password = await bcrypt.hash(senha, 10);
        }

        const afiliadoAtualizado = await prisma.afiliado.update({
            where: { id: id },
            data: dadosAtualizar
        });

        // Remove a senha antes de devolver pro front
        const { password, ...dadosSeguros } = afiliadoAtualizado;
        
        res.json({ mensagem: "Perfil atualizado!", afiliado: dadosSeguros });

    } catch (error) {
        console.error("Erro perfil:", error);
        res.status(500).json({ erro: "Erro ao atualizar perfil." });
    }
});

// 5. NOTIFICAÇÕES E MENSAGENS
app.get('/afiliado/notificacoes', authenticateToken, async (req, res) => {
    try {
        const id = req.user.id;
        const mensagens = await prisma.mensagem.findMany({
            where: { afiliadoId: id, lida: false },
            orderBy: { createdAt: 'desc' }
        });
        const vendas = await prisma.pedido.findMany({
            where: { afiliadoId: id, notificado_afiliado: false },
            orderBy: { createdAt: 'desc' }
        });
        res.json({ mensagens, vendas });
    } catch (e) { res.status(500).json({ mensagens: [], vendas: [] }); }
});

app.post('/afiliado/notificacoes/ler', authenticateToken, async (req, res) => {
    try {
        const id = req.user.id;
        await prisma.mensagem.updateMany({ where: { afiliadoId: id, lida: false }, data: { lida: true } });
        await prisma.pedido.updateMany({ where: { afiliadoId: id, notificado_afiliado: false }, data: { notificado_afiliado: true } });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: "Erro ao limpar" }); }
});

app.get('/afiliado/mensagens', authenticateToken, async (req, res) => {
    try {
        const msgs = await prisma.mensagem.findMany({
            where: { afiliadoId: req.user.id },
            orderBy: { createdAt: 'desc' },
            take: 10
        });
        res.json(msgs);
    } catch(e) { res.status(500).json({ erro: "Erro ao buscar mensagens" }); }
});

// =================================================================
// 🛒 PEDIDOS E PAGAMENTO
// =================================================================
app.post('/finalizar-pedido', async (req, res) => {
    try {
        const { cliente, itens, afiliadoCodigo } = req.body;
        let valorTotal = 0;
        let comissaoReal = 0;
        let itensParaBanco = [];
        let itensTextoZap = ""; 

        for (const i of itens) {
            valorTotal += (i.unitario * i.qtd);
            itensTextoZap += `${i.qtd}x ${i.nome} | `;
            itensParaBanco.push({
                id: parseInt(i.id),
                nome: i.nome,
                qtd: parseInt(i.qtd),
                unitario: i.unitario
            });

            if (afiliadoCodigo) {
                const idProd = parseInt(i.id);
                const produtoOriginal = await prisma.produto.findUnique({ where: { id: idProd } });
                if (produtoOriginal) {
                    const precoCusto = parseFloat(produtoOriginal.preco_novo);
                    const precoVenda = parseFloat(i.unitario);
                    const lucroItem = (precoVenda - precoCusto) * i.qtd;
                    if (lucroItem > 0) comissaoReal += lucroItem;
                }
            }
        }

        let dadosPedido = {
            clienteNome: cliente.nome,
            clienteEmail: cliente.email,
            clienteTelefone: cliente.whatsapp || cliente.telefone,
            clienteEndereco: cliente.endereco,
            valorTotal: valorTotal,
            itens: JSON.stringify(itensParaBanco), 
            comissaoGerada: 0.0,
            status: "PENDENTE"
        };

        if (afiliadoCodigo) {
            const afiliado = await prisma.afiliado.findUnique({ where: { codigo: afiliadoCodigo } });
            if (afiliado) {
                dadosPedido.afiliadoId = afiliado.id;
                dadosPedido.comissaoGerada = comissaoReal;
            }
        }

        const pedido = await prisma.pedido.create({ data: dadosPedido });

        // ROBÔ DO ZAP
        try {
            const SEU_TELEFONE = "558287515891"; 
            const API_KEY = "6414164"; 
            const msg = `🔔 *Nova Venda!* (#${pedido.id})\n💰 R$ ${valorTotal.toFixed(2)}\n📦 ${itensTextoZap}`;
            const urlBot = `https://api.callmebot.com/whatsapp.php?phone=${SEU_TELEFONE}&text=${encodeURIComponent(msg)}&apikey=${API_KEY}`;
            fetch(urlBot).catch(e => console.error("Erro Zap", e));
        } catch (e) {}

        res.json(pedido);

    } catch (error) { 
        console.error("ERRO FINALIZAR:", error);
        res.status(500).json({ erro: "Erro ao processar" }); 
    }
});

// Adicione junto com as outras rotas de /afiliado/

app.get('/afiliado/buscar-cliente/:doc', authenticateToken, async (req, res) => {
    try {
        const { doc } = req.params;
        
        // Busca cliente pelo Documento (CPF/CNPJ) E que pertença a este afiliado
        const cliente = await prisma.clienteAfiliado.findFirst({
            where: {
                documento: doc,
                afiliadoId: req.user.id
            }
        });

        if (cliente) {
            res.json({ found: true, cliente });
        } else {
            res.json({ found: false });
        }
    } catch (e) {
        console.error(e);
        res.status(500).json({ erro: "Erro ao buscar cliente" });
    }
});

// =================================================================
// 👑 ÁREA ADMIN (ADMINISTRAÇÃO)
// =================================================================

// DASHBOARD ADMIN
// =================================================================
// 📊 DASHBOARD ADMIN (CÁLCULO FINANCEIRO REAL)
// =================================================================
app.get('/admin/dashboard-stats', authenticateToken, async (req, res) => {
    if (!req.user || req.user.role !== 'admin') return res.sendStatus(403);

    try {
        const { periodo, inicio, fim } = req.query;

        // === CONFIG FINANCEIRA ===
        const CONFIG_FINANCEIRA = {
            impostoGoverno: 0.06,
            taxaAsaasPix: 0.99,
            taxaAsaasBoleto: 1.99,
            taxaAsaasCartaoPct: 0.055,
            taxaAsaasCartaoFixo: 0.49
        };

        // === 1. FILTRO DE DATA ===
        let whereData = {}; 
        const hoje = new Date();

        if (periodo === 'hoje') {
            const start = new Date(hoje.setHours(0, 0, 0, 0));
            const end = new Date(hoje.setHours(23, 59, 59, 999));
            whereData = { createdAt: { gte: start, lte: end } };
        } 
        else if (periodo === '7dias') {
            const start = new Date();
            start.setDate(start.getDate() - 7);
            start.setHours(0, 0, 0, 0);
            whereData = { createdAt: { gte: start } };
        }
        else if (periodo === '30dias') {
            const start = new Date();
            start.setDate(start.getDate() - 30);
            start.setHours(0, 0, 0, 0);
            whereData = { createdAt: { gte: start } };
        }
        else if (periodo === 'mes_atual') {
            const start = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
            whereData = { createdAt: { gte: start } };
        }
        else if (inicio && fim) {
            const start = new Date(inicio);
            const end = new Date(fim);
            end.setHours(23, 59, 59, 999);
            whereData = { createdAt: { gte: start, lte: end } };
        }

        // === 2. FILTRO DE SAQUES (CORREÇÃO DO BUG) ===
        // Montamos o objeto dinamicamente para não enviar 'undefined'
        let whereSaque = { status: 'PAGO' };
        if (whereData.createdAt) {
            whereSaque.dataPagamento = whereData.createdAt;
        }

        // === 3. BUSCAS ===
        const [pedidosReais, produtosDB, saquesPagosAgg, saldoPendenteAgg, totalPedidosCount, estoqueBaixoCount, produtosCount] = await Promise.all([
            // A. Pedidos (Gerados)
            prisma.pedido.findMany({
                where: {
                    ...whereData,
                    status: { in: ['APROVADO', 'ENTREGUE', 'ENVIADO', 'DEVOLUCAO_PARCIAL'] }
                },
                select: { id: true, valorTotal: true, comissaoGerada: true, itens: true, metodoPagamento: true, createdAt: true }
            }),
            // B. Custos
            prisma.produto.findMany({ select: { id: true, preco_custo: true, preco_novo: true } }),
            
            // C. Saques Pagos (Fluxo de Caixa)
            prisma.saque.aggregate({
                _sum: { valor: true },
                where: whereSaque // Filtro corrigido
            }),

            // D. Saldo Pendente (O que falta pagar - Geral)
            // Nota: Isso pega o saldo ATUAL de todos, independente de data, pois é dívida acumulada
            prisma.afiliado.aggregate({
                _sum: { saldo: true }
            }),

            // E. Contadores
            prisma.pedido.count({ where: { ...whereData, status: { in: ['APROVADO', 'ENTREGUE', 'ENVIADO'] } } }),
            prisma.produto.count({ where: { estoque: { lte: 5 } } }),
            prisma.produto.count()
        ]);

        // === 4. CÁLCULOS ===
        const mapaCustos = {};
        produtosDB.forEach(p => {
            let custo = parseFloat(p.preco_custo);
            if (!custo || isNaN(custo)) custo = parseFloat(p.preco_novo) * 0.60; 
            mapaCustos[p.id] = custo;
        });

        let faturamentoTotal = 0;
        let custoMercadoriaTotal = 0;
        let impostosTotal = 0;
        let taxasAsaasTotal = 0;
        let comissoesGeradasTotal = 0; 

        for (const pedido of pedidosReais) {
            const valorVenda = parseFloat(pedido.valorTotal || 0);
            faturamentoTotal += valorVenda;
            comissoesGeradasTotal += parseFloat(pedido.comissaoGerada || 0);
            impostosTotal += (valorVenda * CONFIG_FINANCEIRA.impostoGoverno);

            let custoGateway = 0;
            const metodo = pedido.metodoPagamento ? pedido.metodoPagamento.toUpperCase() : 'PIX';
            if (metodo.includes('CARTAO') || metodo.includes('CREDIT')) {
                custoGateway = (valorVenda * CONFIG_FINANCEIRA.taxaAsaasCartaoPct) + CONFIG_FINANCEIRA.taxaAsaasCartaoFixo;
            } else if (metodo.includes('BOLETO')) {
                custoGateway = CONFIG_FINANCEIRA.taxaAsaasBoleto;
            } else {
                custoGateway = CONFIG_FINANCEIRA.taxaAsaasPix;
            }
            taxasAsaasTotal += custoGateway;

            try {
                const listaItens = typeof pedido.itens === 'string' ? JSON.parse(pedido.itens) : pedido.itens;
                if (Array.isArray(listaItens)) {
                    listaItens.forEach(item => {
                        const idProd = parseInt(item.id || item.produtoId);
                        const qtd = parseInt(item.qtd || item.quantidade || 1);
                        const custoUnitario = mapaCustos[idProd] || 0; 
                        custoMercadoriaTotal += (custoUnitario * qtd);
                    });
                }
            } catch (err) {}
        }

        const lucroLiquidoReal = faturamentoTotal - (custoMercadoriaTotal + impostosTotal + taxasAsaasTotal + comissoesGeradasTotal);

        // === 5. ULTIMOS PEDIDOS ===
        const ultimosPedidos = await prisma.pedido.findMany({
            take: 10,
            orderBy: { createdAt: 'desc' },
            where: { ...whereData },
            include: { afiliado: { select: { nome: true } } }
        });

        res.json({
            faturamento: faturamentoTotal,
            lucroLiquido: lucroLiquidoReal,
            
            // OS TRÊS DADOS DE COMISSÃO:
            comissoesPagas: saquesPagosAgg._sum.valor || 0, // O que saiu da conta (DRE Fluxo)
            comissoesGeradas: comissoesGeradasTotal,       // O custo gerado (DRE Competência)
            comissoesPendentes: saldoPendenteAgg._sum.saldo || 0, // Dívida atual (O que falta pagar)

            totalPedidos: totalPedidosCount,
            produtos: produtosCount,
            estoqueBaixo: estoqueBaixoCount,
            ultimosPedidos
        });

    } catch (e) {
        console.error("Erro Dashboard Admin:", e);
        res.status(500).json({ erro: e.message });
    }
});
// LISTAR PEDIDOS
app.get('/admin/pedidos', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    try {
        const pedidos = await prisma.pedido.findMany({
            orderBy: { createdAt: 'desc' },
            include: { afiliado: true } 
        });
        res.json(pedidos);
    } catch (e) { res.status(500).json({ erro: "Erro ao buscar pedidos" }); }
});


// =================================================================
// 🔄 ATUALIZAR STATUS DO PEDIDO (COM SISTEMA DE DÍVIDA/CLAWBACK)
// =================================================================
app.put('/admin/orders/:id/status', authenticateToken, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { status, itens, novoTotal } = req.body; 

        // Busca pedido antigo e dados do afiliado
        const pedidoAntigo = await prisma.pedido.findUnique({ 
            where: { id: id },
            include: { afiliado: true }
        });

        if (!pedidoAntigo) return res.status(404).json({ erro: "Pedido não encontrado" });

        // =================================================================================
        // 1. BAIXA DE ESTOQUE (QUANDO APROVA PELA PRIMEIRA VEZ)
        // =================================================================================
        if (status === 'APROVADO' && pedidoAntigo.status !== 'APROVADO') {
            try {
                const listaItens = typeof pedidoAntigo.itens === 'string' ? JSON.parse(pedidoAntigo.itens) : pedidoAntigo.itens;
                if (Array.isArray(listaItens)) {
                    for (const item of listaItens) {
                        if(item.id) {
                            await prisma.produto.update({
                                where: { id: item.id },
                                data: { estoque: { decrement: item.qtd } }
                            });
                        }
                    }
                }
            } catch (err) { console.error("Erro estoque:", err); }
        }

// =================================================================================
        // 2. LIBERAR COMISSÃO E COBRAR DÍVIDA (LÓGICA BLINDADA 🛡️)
        // =================================================================================
        if (status === 'APROVADO' && pedidoAntigo.status !== 'APROVADO') {
            if (pedidoAntigo.afiliadoId && pedidoAntigo.comissaoGerada > 0) {
                
                // Busca o afiliado atualizado
                const afiliado = await prisma.afiliado.findUnique({ where: { id: pedidoAntigo.afiliadoId }});
                
                // Força conversão para garantir números (evita erro de texto)
                const dividaAtual = parseFloat(afiliado.saldoDevedor || 0);
                const comissaoNova = parseFloat(pedidoAntigo.comissaoGerada);
                const saldoAtualCarteira = parseFloat(afiliado.saldo || 0);

                if (dividaAtual > 0) {
                    // 🔴 O AFILIADO TEM DÍVIDA!
                    if (comissaoNova >= dividaAtual) {
                        // Cenário 1: Paga TUDO e sobra troco
                        const sobra = comissaoNova - dividaAtual;
                        const novoSaldoCarteira = saldoAtualCarteira + sobra; // Calculamos aqui
                        
                        await prisma.afiliado.update({
                            where: { id: pedidoAntigo.afiliadoId },
                            data: { 
                                saldoDevedor: 0.0,       // ZERA A DÍVIDA NA MARRA
                                saldo: novoSaldoCarteira // Define o valor exato (mais seguro que increment)
                            }
                        });
                    } else {
                        // Cenário 2: Abate parcial (Comissão não paga tudo)
                        await prisma.afiliado.update({
                            where: { id: pedidoAntigo.afiliadoId },
                            data: { 
                                saldoDevedor: { decrement: comissaoNova } // Diminui a dívida
                                // Saldo não muda
                            }
                        });
                    }
                } else {
                    // 🟢 SEM DÍVIDA: Recebe tudo
                    await prisma.afiliado.update({
                        where: { id: pedidoAntigo.afiliadoId },
                        data: { saldo: { increment: comissaoNova } }
                    });
                }
            }
        }

        // =================================================================================
        // 3. ESTORNO TOTAL (QUANDO CANCELA PEDIDO JÁ PAGO)
        // =================================================================================
        if (status === 'CANCELADO' && (pedidoAntigo.status === 'APROVADO' || pedidoAntigo.status === 'ENTREGUE' || pedidoAntigo.status === 'DEVOLUCAO_PARCIAL')) {
            
            // A. Devolve TUDO ao estoque físico
            try {
                const listaItens = typeof pedidoAntigo.itens === 'string' ? JSON.parse(pedidoAntigo.itens) : pedidoAntigo.itens;
                if (Array.isArray(listaItens)) {
                    for (const item of listaItens) {
                        if(item.id) {
                            await prisma.produto.update({
                                where: { id: item.id },
                                data: { estoque: { increment: item.qtd } }
                            });
                        }
                    }
                }
            } catch(e) { console.error("Erro devolucao estoque total", e); }

            // B. Estorno Financeiro (Gera Dívida se não tiver saldo)
            if (pedidoAntigo.afiliadoId && pedidoAntigo.comissaoGerada > 0) {
                const afiliado = await prisma.afiliado.findUnique({ where: { id: pedidoAntigo.afiliadoId }});
                const valorEstorno = pedidoAntigo.comissaoGerada;

                if (afiliado.saldo >= valorEstorno) {
                    // Tem saldo, desconta normal
                    await prisma.afiliado.update({
                        where: { id: pedidoAntigo.afiliadoId },
                        data: { saldo: { decrement: valorEstorno } }
                    });
                } else {
                    // NÃO tem saldo suficiente -> Vira DÍVIDA
                    const saldoDisponivel = afiliado.saldo > 0 ? afiliado.saldo : 0;
                    const oQueFalta = valorEstorno - saldoDisponivel;

                    await prisma.afiliado.update({
                        where: { id: pedidoAntigo.afiliadoId },
                        data: { 
                            saldo: 0,
                            saldoDevedor: { increment: oQueFalta } 
                        }
                    });
                }
            }
        }

        // =================================================================================
        // 4. DEVOLUÇÃO PARCIAL (FINANCEIRO + ESTOQUE AUTOMÁTICO)
        // =================================================================================
        let dadosAtualizacao = { status: status }; 
        
        if (status === 'DEVOLUCAO_PARCIAL') {
            if (novoTotal !== undefined && itens) {
                
                // A. ESTORNO FINANCEIRO DO AFILIADO (PROPORCIONAL)
                if (pedidoAntigo.afiliadoId && (pedidoAntigo.status === 'APROVADO' || pedidoAntigo.status === 'ENTREGUE' || pedidoAntigo.status === 'DEVOLUCAO_PARCIAL')) {
                    const valorAntigo = parseFloat(pedidoAntigo.valorTotal);
                    const valorNovo = parseFloat(novoTotal);
                    const diferencaValor = valorAntigo - valorNovo;
                    
                    if (diferencaValor > 0 && valorAntigo > 0) {
                        const porcentagemDevolvida = diferencaValor / valorAntigo;
                        const valorEstorno = pedidoAntigo.comissaoGerada * porcentagemDevolvida;

                        // LÓGICA DO SALDO DEVEDOR
                        const afiliado = await prisma.afiliado.findUnique({ where: { id: pedidoAntigo.afiliadoId }});

                        if (afiliado.saldo >= valorEstorno) {
                            // Tem saldo, desconta normal
                            await prisma.afiliado.update({
                                where: { id: pedidoAntigo.afiliadoId },
                                data: { saldo: { decrement: valorEstorno } }
                            });
                        } else {
                            // Vira Dívida
                            const saldoDisponivel = afiliado.saldo > 0 ? afiliado.saldo : 0;
                            const oQueFalta = valorEstorno - saldoDisponivel;

                            await prisma.afiliado.update({
                                where: { id: pedidoAntigo.afiliadoId },
                                data: { 
                                    saldo: 0,
                                    saldoDevedor: { increment: oQueFalta } 
                                }
                            });
                        }

                        // Atualiza a comissão que sobrou no pedido
                        const novaComissao = pedidoAntigo.comissaoGerada - valorEstorno;
                        dadosAtualizacao.comissaoGerada = novaComissao;
                    }
                }

                // B. ESTORNO AUTOMÁTICO DE ESTOQUE (Mantido idêntico ao original)
                try {
                    const listaAntiga = typeof pedidoAntigo.itens === 'string' ? JSON.parse(pedidoAntigo.itens) : pedidoAntigo.itens;
                    const listaNova = typeof itens === 'string' ? JSON.parse(itens) : itens;

                    for (const itemAntigo of listaAntiga) {
                        // Tenta achar o item na lista nova
                        const itemNovo = listaNova.find(i => (i.id && i.id === itemAntigo.id) || i.nome === itemAntigo.nome) || { qtd: 0 };
                        
                        const qtdAntiga = parseInt(itemAntigo.qtd);
                        const qtdNova = parseInt(itemNovo.qtd);
                        const qtdDevolvida = qtdAntiga - qtdNova;

                        // Se a quantidade diminuiu, devolve a diferença pro estoque
                        if (qtdDevolvida > 0 && itemAntigo.id) {
                            await prisma.produto.update({
                                where: { id: itemAntigo.id },
                                data: { estoque: { increment: qtdDevolvida } }
                            });
                        }
                    }
                } catch (erroEstoque) { console.error("Erro estoque parcial:", erroEstoque); }

                // C. SALVA NOVO CARRINHO NO PEDIDO
                dadosAtualizacao.itens = typeof itens === 'object' ? JSON.stringify(itens) : itens;
                dadosAtualizacao.valorTotal = parseFloat(novoTotal);
            }
        }

        // =================================================================================
        // UPDATE FINAL NO BANCO
        // =================================================================================
        const pedidoAtualizado = await prisma.pedido.update({
            where: { id: id },
            data: dadosAtualizacao
        });

        res.json(pedidoAtualizado);

    } catch (e) { 
        console.error("Erro Status:", e);
        res.status(500).json({ erro: e.message }); 
    }
});

// Rota para pegar detalhes de UM pedido específico
app.get('/admin/orders/:id', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);

    try {
        const id = parseInt(req.params.id);
        const pedido = await prisma.pedido.findUnique({
            where: { id: id },
            include: {
                afiliado: { // Traz os dados do afiliado ligado à venda
                    select: { nome: true, telefone: true, codigo: true }
                }
            }
        });

        if (!pedido) return res.status(404).json({ erro: "Pedido não encontrado" });

        res.json(pedido);
    } catch (e) {
        console.error(e);
        res.status(500).json({ erro: "Erro ao buscar detalhes" });
    }
});

// ============================================================
// 💰 ROTA: SOMATÓRIA TOTAL DE COMISSÕES (SALDOS DOS AFILIADOS)
// ============================================================
app.get('/admin/comissoes-totais', authenticateToken, async (req, res) => {
    try {
        // Soma o campo 'saldo' de todos os afiliados
        const agredado = await prisma.afiliado.aggregate({
            _sum: {
                saldo: true
            }
        });

        // Se não tiver ninguém, retorna 0
        const total = agredado._sum.saldo || 0;

        res.json({ total });
    } catch (e) {
        console.error(e);
        res.status(500).json({ erro: "Erro ao calcular total." });
    }
});

// CRUD PRODUTOS
app.post('/admin/produtos', authenticateToken, async (req, res) => {
    if(req.user.role !== 'admin') return res.sendStatus(403);
    try {
        const p = await prisma.produto.create({ data: req.body });
        res.json(p);
    } catch(e) { res.status(500).json({erro: e.message}); }
});
app.put('/admin/produtos/:id', authenticateToken, async (req, res) => {
    if(req.user.role !== 'admin') return res.sendStatus(403);
    try {
        const p = await prisma.produto.update({ where: { id: parseInt(req.params.id) }, data: req.body });
        res.json(p);
    } catch(e) { res.status(500).json({erro: e.message}); }
});
app.delete('/admin/produtos/:id', authenticateToken, async (req, res) => {
    if(req.user.role !== 'admin') return res.sendStatus(403);
    try {
        await prisma.produto.delete({ where: { id: parseInt(req.params.id) } });
        res.json({success: true});
    } catch(e) { res.status(500).json({erro: e.message}); }
});
// Rota para LISTAR produtos no Admin com PAGINAÇÃO
// Rota para LISTAR produtos no Admin com PAGINAÇÃO e BUSCA GLOBAL
app.get('/admin/produtos', authenticateToken, async (req, res) => {
    // 1. Segurança: Só Admin entra
    if(!req.user || req.user.role !== 'admin') return res.sendStatus(403);

    try {
        // 2. Configura a Paginação e pega o termo de busca
        const pagina = parseInt(req.query.page) || 1; 
        const limite = 50; 
        const pular = (pagina - 1) * limite; 
        const search = req.query.search || ''; // <-- Captura a busca da URL

        // =========================================================
        // 🧠 3. INTELIGÊNCIA DE BUSCA GLOBAL
        // =========================================================
        let whereClause = {};
        let condicoesAnd = [];

        if (search) {
            const termos = search.trim().split(/\s+/); // Separa por espaços (Ex: "Vela Gol")
            
            termos.forEach(termo => {
                let blocoOr = [
                    { titulo: { contains: termo, mode: 'insensitive' } },
                    { referencia: { contains: termo, mode: 'insensitive' } },
                    { carros: { contains: termo, mode: 'insensitive' } },
                    { fabricante: { contains: termo, mode: 'insensitive' } },
                    { categoria: { contains: termo, mode: 'insensitive' } }
                ];

                // Se o que o cara digitou for um número, tenta achar pelo ID também
                if (!isNaN(termo)) {
                    blocoOr.push({ id: parseInt(termo) });
                }

                condicoesAnd.push({ OR: blocoOr });
            });

            if (condicoesAnd.length > 0) {
                whereClause.AND = condicoesAnd;
            }
        }
        // =========================================================

        // 4. Busca no Banco (Filtro + Total + Lista da Página)
        const [total, produtos] = await prisma.$transaction([
            prisma.produto.count({ where: whereClause }), // Conta APENAS os filtrados
            prisma.produto.findMany({
                where: whereClause, // Aplica o filtro na listagem
                take: limite,
                skip: pular,
                orderBy: { id: 'desc' } 
            })
        ]);

        const totalPaginas = Math.ceil(total / limite);

        // 5. Devolve os dados organizados EXATAMENTE como o seu front-end espera
        res.json({
            data: produtos,
            total: total,
            paginaAtual: pagina,
            totalPaginas: totalPaginas
        });

    } catch (e) {
        console.error("Erro lista admin:", e);
        res.status(500).json({erro: e.message});
    }
});

// ADMIN MENSAGENS E SUGESTÕES
app.post('/admin/mensagens', authenticateToken, upload.single('arquivo'), async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    try {
        const { afiliadoId, texto } = req.body;
        const arquivoPath = req.file ? req.file.path : null;
        await prisma.mensagem.create({
            data: {
                texto: texto || "",
                arquivo: arquivoPath,
                afiliadoId: parseInt(afiliadoId)
            }
        });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ erro: "Erro ao enviar." }); }
});

app.get('/admin/afiliados', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    try {
        const afiliados = await prisma.afiliado.findMany({ include: { pedidos: true } });
        const resposta = afiliados.map(af => ({
            id: af.id, nome: af.nome, telefone: af.telefone, codigo: af.codigo, saldo: af.saldo,saldoDevedor: af.saldoDevedor || 0.0,
            aprovado: af.aprovado, chavePix: af.chavePix, banco: af.banco, agencia: af.agencia, conta: af.conta,
            vendasTotais: af.pedidos.reduce((acc, p) => acc + p.valorTotal, 0)
        }));
        res.json(resposta);
    } catch (e) { res.status(500).json({ erro: "Erro ao buscar afiliados" }); }
});

app.put('/admin/afiliados/:id/status', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    try {
        await prisma.afiliado.update({
            where: { id: parseInt(req.params.id) },
            data: { aprovado: req.body.aprovado }
        });
        res.json({ success: true });
    } catch(e) { res.status(500).json({ erro: "Erro status" }); }
});

// ============================================================
// 📉 RELATÓRIO DE DEVEDORES (RESUMO FINANCEIRO)
// ============================================================
app.get('/admin/devedores-resumo', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    try {
        // Busca apenas quem deve alguma coisa (saldoDevedor > 0)
        const devedores = await prisma.afiliado.findMany({
            where: { saldoDevedor: { gt: 0 } },
            select: { id: true, nome: true, saldoDevedor: true },
            orderBy: { saldoDevedor: 'desc' }
        });
        
        // Soma tudo
        const totalRecuperar = devedores.reduce((acc, d) => acc + d.saldoDevedor, 0);
        
        res.json({ 
            totalRecuperar, 
            qtdDevedores: devedores.length,
            lista: devedores // Manda a lista caso queira fazer um popup
        });
    } catch (e) { res.status(500).json({ erro: "Erro ao buscar resumo" }); }
});

// SUGESTÕES
app.post('/afiliado/sugestoes', authenticateToken, async (req, res) => {
    try {
        const { produtoId, termo, motivo } = req.body;
        await prisma.sugestao.create({
            data: { termo, motivo, produtoId: parseInt(produtoId), afiliadoId: req.user.id }
        });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ erro: "Erro sugestão" }); }
});
app.get('/admin/sugestoes', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    const lista = await prisma.sugestao.findMany({ where: { status: 'PENDENTE' }, include: { produto: true, afiliado: true } });
    res.json(lista);
});
app.post('/admin/sugestoes/:id/aprovar', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    try {
        const sugestao = await prisma.sugestao.findUnique({ where: { id: parseInt(req.params.id) }, include: { produto: true } });
        const tagsAtuais = sugestao.produto.tags || ""; 
        const novasTags = tagsAtuais + " " + sugestao.termo; 
        await prisma.produto.update({ where: { id: sugestao.produtoId }, data: { tags: novasTags } });
        await prisma.sugestao.update({ where: { id: sugestao.id }, data: { status: 'APROVADO' } });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ erro: "Erro aprovar" }); }
});
app.post('/admin/sugestoes/:id/rejeitar', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    await prisma.sugestao.update({ where: { id: parseInt(req.params.id) }, data: { status: 'REJEITADO' } });
    res.json({ success: true });
});


// ============================================================
// 💸 ROTA: SOLICITAR SAQUE
// ============================================================
app.post('/afiliado/saque', authenticateToken, async (req, res) => {
    try {
        const id = req.user.id;

        // 1. Busca o afiliado para ver o saldo
        const afiliado = await prisma.afiliado.findUnique({ where: { id } });

        if (!afiliado) return res.status(404).json({ erro: "Afiliado não encontrado" });
        if (afiliado.saldo <= 0) return res.status(400).json({ erro: "Saldo insuficiente para saque." });

        const valorSaque = afiliado.saldo;

        // 2. Transação Atômica (Segurança: Faz tudo ou não faz nada)
        // Cria o registro do saque E zera o saldo ao mesmo tempo
        await prisma.$transaction([
            prisma.saque.create({
                data: {
                    valor: valorSaque,
                    afiliadoId: id,
                    status: "PENDENTE"
                }
            }),
            prisma.afiliado.update({
                where: { id },
                data: { saldo: 0 } // Zera a carteira
            })
        ]);

        // 3. AVISA O ADMIN NO WHATSAPP (CallMeBot)
        try {
            const SEU_TELEFONE = "558287515891"; // <--- CONFIRME SEU NÚMERO
            const API_KEY = "6414164";           // <--- CONFIRME SUA API KEY
            
            const msg = `💸 *Solicitação de Saque!* 💸\n\n` +
                        `👤 Parceiro: ${afiliado.nome}\n` +
                        `💰 Valor: R$ ${valorSaque.toFixed(2)}\n` +
                        `🏦 Pix: ${afiliado.chavePix || "Não cadastrado"}\n\n` +
                        `Acesse o banco para pagar.`;

            const urlBot = `https://api.callmebot.com/whatsapp.php?phone=${SEU_TELEFONE}&text=${encodeURIComponent(msg)}&apikey=${API_KEY}`;
            fetch(urlBot).catch(e => console.error("Erro Zap Saque", e));

        } catch (e) {}

        res.json({ success: true, valor: valorSaque });

    } catch (e) {
        console.error("Erro Saque:", e);
        res.status(500).json({ erro: "Erro ao processar saque." });
    }
});

// ============================================================
// 🏦 ROTAS DE SAQUE (HISTÓRICO E PAGAMENTO)
// ============================================================

// 1. AFILIADO: VER MEUS SAQUES
app.get('/afiliado/saques', authenticateToken, async (req, res) => {
    try {
        const saques = await prisma.saque.findMany({
            where: { afiliadoId: req.user.id },
            orderBy: { dataSolicitacao: 'desc' }
        });
        res.json(saques);
    } catch (e) { res.status(500).json({ erro: "Erro ao buscar saques" }); }
});

// ============================================================
// 💰 ROTA ADMIN: CONFIRMAR PAGAMENTO (ATUALIZADA)
// ============================================================
app.post('/admin/saques/:id/confirmar', authenticateToken, upload.single('comprovante'), async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);

    try {
        const idSaque = parseInt(req.params.id);
        const arquivoPath = req.file ? req.file.path : null; // Pega o caminho do arquivo

        // 1. Atualiza o Saque para PAGO e SALVA O COMPROVANTE
        await prisma.saque.update({
            where: { id: idSaque },
            data: { 
                status: "PAGO", 
                dataPagamento: new Date(),
                comprovante: arquivoPath // <--- AQUI ESTÁ A MÁGICA
            }
        });

        // 2. Também manda mensagem avisando (Opcional, mas legal manter)
        if (arquivoPath) {
            // Busca o afiliadoId do saque para saber pra quem mandar
            const saque = await prisma.saque.findUnique({ where: { id: idSaque } });
            
            await prisma.mensagem.create({
                data: {
                    texto: `✅ Seu saque de R$ ${saque.valor.toFixed(2)} foi pago!`,
                    arquivo: arquivoPath,
                    afiliadoId: saque.afiliadoId
                }
            });
        }

        res.json({ success: true });

    } catch (e) {
        console.error("Erro ao pagar:", e);
        res.status(500).json({ erro: "Erro ao processar pagamento." });
    }
});

// 3. ADMIN: VER TODOS OS SAQUES PENDENTES
app.get('/admin/saques-pendentes', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    try {
        const saques = await prisma.saque.findMany({
            where: { status: 'PENDENTE' },
            include: { afiliado: true },
            orderBy: { dataSolicitacao: 'asc' }
        });
        res.json(saques);
    } catch (e) { res.status(500).json({ erro: "Erro" }); }
});

// ============================================================
// ROTA DE CHECKOUT (DIVISÃO PROPORCIONAL DE TAXAS) ⚖️
// ============================================================
app.post('/api/checkout/pix', async (req, res) => {
    try {
        const { itens, cliente, afiliadoId, afiliadoCodigo, metodoPagamento, parcelasSelecionadas } = req.body;

        // 1. Identificar Afiliado
        let idFinalAfiliado = null;
        let walletIdAfiliado = null;
        if (afiliadoId) {
            idFinalAfiliado = parseInt(afiliadoId);
        } else if (afiliadoCodigo) {
            const af = await prisma.afiliado.findUnique({ where: { codigo: afiliadoCodigo } });
            if (af) {
                idFinalAfiliado = af.id;
                walletIdAfiliado = af.walletId;
            }
        }

        // ==========================================
        // PASSO A: SOMA DOS PRODUTOS (BASE)
        // ==========================================
        let valorTotalProdutos = 0;      
        let custoTotalProdutos = 0;   
        let lucroBrutoLoja = 0;       
        let lucroBrutoAfiliado = 0;   
        let itensParaBanco = [];

        for (const item of itens) {
            const prodBanco = await prisma.produto.findUnique({ where: { id: item.id } });
            if (!prodBanco) continue;

            const limparValor = (val) => val ? parseFloat(String(val).replace(',', '.')) : 0;
            const precoLoja = limparValor(prodBanco.preco_novo); 
            const custoPeca = limparValor(prodBanco.preco_custo) || (precoLoja * 0.8); 
            
            const qtd = parseInt(item.quantidade);
            const margemItem = item.customMargin ? parseFloat(item.customMargin) : 0;

            let precoVendaUnitario = precoLoja;
            if (margemItem > 0) {
                precoVendaUnitario = precoLoja * (1 + (margemItem / 100));
            }

            const totalItemVenda = precoVendaUnitario * qtd;
            const totalItemCusto = custoPeca * qtd;
            const totalItemLojaBase = precoLoja * qtd; 

            // Lucro Bruto (Baseado no preço do produto, sem juros)
            const faturamentoAfiliado = totalItemVenda - totalItemLojaBase; 
            const faturamentoLoja = totalItemLojaBase - totalItemCusto;

            valorTotalProdutos += totalItemVenda;
            custoTotalProdutos += totalItemCusto;
            lucroBrutoAfiliado += faturamentoAfiliado;
            lucroBrutoLoja += faturamentoLoja;

            itensParaBanco.push({
                id: prodBanco.id, 
                nome: prodBanco.titulo, 
                qtd: qtd,
                unitario: precoVendaUnitario, 
                total: totalItemVenda, 
                imagem: prodBanco.imagem
            });
        }

        // ==========================================
        // PASSO B: CÁLCULO DOS JUROS (ANTES DAS TAXAS) 🔄
        // ==========================================
        const metodoPuro = metodoPagamento ? metodoPagamento.toUpperCase().trim() : 'PIX';
        const numParcelas = parseInt(parcelasSelecionadas) || 1;
        
        // O valor base da cobrança é o total dos produtos
        let valorFinalCobranca = valorTotalProdutos; 

        // Se for parcelado > 2x, aplica juros no Valor Final
            if (numParcelas > 2) {
            const fatorAsaas = {
                1: 1.000, 2: 1.000, 3: 1.050, 4: 1.064,
                5: 1.078, 6: 1.092, 7: 1.106, 8: 1.120,
                9: 1.133, 10: 1.147, 11: 1.161, 12: 1.175
            };
            
            // Pega o multiplicador correto ou trava no máximo (12x) por segurança
            const multiplicador = fatorAsaas[numParcelas] || 1.175; 
            valorFinalCobranca = valorTotalProdutos * multiplicador;

        // ==========================================
        // PASSO C: CÁLCULO DAS TAXAS (SOBRE O TOTAL REAL) 💸
        // ==========================================
        let custoTaxasTotal = 0;
        
        // Imposto governo sobre o total transacionado (Nota Fiscal sai cheia)
        const valorImposto = valorFinalCobranca * CONFIG_FINANCEIRA.impostoGoverno;
        custoTaxasTotal += valorImposto;
        
        if (metodoPuro === 'CARTAO') {
            // Asaas cobra % sobre o valor CHEIO (com juros)
            custoTaxasTotal += (valorFinalCobranca * CONFIG_FINANCEIRA.taxaAsaasCartaoPct) + CONFIG_FINANCEIRA.taxaAsaasCartaoFixo;
        } else {
            custoTaxasTotal += CONFIG_FINANCEIRA.taxaAsaasPix;
        }

        // ==========================================
        // PASSO D: RATEIO (PROTEGENDO O LUCRO DO AFILIADO) 🛡️
        // ==========================================
        const lucroOperacionalTotal = lucroBrutoLoja + lucroBrutoAfiliado;
        let comissaoLiquidaAfiliado = 0;
        let parteTaxaAfiliado = 0;
        let parteTaxaLoja = custoTaxasTotal;
        let lucroLiquidoLoja = lucroBrutoLoja - custoTaxasTotal;

        if (lucroOperacionalTotal > 0 && lucroBrutoAfiliado > 0) {
            // O peso é calculado sobre o lucro bruto DOS PRODUTOS
            const pesoAfiliado = lucroBrutoAfiliado / lucroOperacionalTotal;
            
            // Mas a taxa a ser paga agora é maior (pois inclui a taxa sobre os juros)
            parteTaxaAfiliado = custoTaxasTotal * pesoAfiliado;
            
            // Isso vai reduzir a comissão líquida, corrigindo o valor
            comissaoLiquidaAfiliado = lucroBrutoAfiliado - parteTaxaAfiliado;
            
            parteTaxaLoja = custoTaxasTotal - parteTaxaAfiliado;
            lucroLiquidoLoja = lucroBrutoLoja - parteTaxaLoja;
        }
        if (comissaoLiquidaAfiliado < 0) comissaoLiquidaAfiliado = 0;

        // ==========================================
        // PASSO E: GERAÇÃO DO LINK ASAAS
        // ==========================================
        let dadosAsaas;
        
        if (metodoPuro === 'CARTAO') {
            dadosAsaas = await criarLinkPagamento(
                cliente, 
                valorFinalCobranca, // Valor COM juros
                `Pedido Cartão (${numParcelas}x) - AutoPeças`,
                walletIdAfiliado,
                comissaoLiquidaAfiliado,
                numParcelas
            );
        } else {
            dadosAsaas = await criarCobrancaPixDireto( 
                cliente, 
                valorTotalProdutos, // Pix é valor base
                `Pedido PIX - AutoPeças`,
                walletIdAfiliado,
                comissaoLiquidaAfiliado
            );
        }

        // --- LOG DE AUDITORIA ---
        console.log(`
        ============================================================
        📊 AUDITORIA CORRIGIDA - MÉTODO: ${metodoPuro} (${numParcelas}x)
        ============================================================
        💰 PRODUTOS (BASE):      R$ ${valorTotalProdutos.toFixed(2)}
        📈 VALOR COM JUROS:      R$ ${valorFinalCobranca.toFixed(2)}
        🧾 TAXAS TOTAIS (REAL):  R$ ${custoTaxasTotal.toFixed(2)} (Base calc: R$ ${valorFinalCobranca.toFixed(2)})
        
        ⚖️ RATEIO FINAL:
        🤝 AFILIADO:
           - Lucro Bruto (Prod): R$ ${lucroBrutoAfiliado.toFixed(2)}
           - Taxa Proporcional: -R$ ${parteTaxaAfiliado.toFixed(2)}
           - COMISSÃO FINAL:     R$ ${comissaoLiquidaAfiliado.toFixed(2)}
        ============================================================
        `);

        // 🟢 SALVA O PEDIDO
        const novoPedido = await prisma.pedido.create({
            data: {
                clienteNome: cliente.nome,
                clienteDoc: cliente.documento,
                clienteEmail: cliente.email,
                clienteTelefone: cliente.telefone,
                clienteEndereco: cliente.endereco,
                valorTotal: (metodoPuro === 'CARTAO') ? valorFinalCobranca : valorTotalProdutos,
                itens: JSON.stringify(itensParaBanco),
                status: 'AGUARDANDO_PAGAMENTO',
                asaasId: dadosAsaas.id, 
                afiliadoId: idFinalAfiliado, 
                comissaoGerada: comissaoLiquidaAfiliado,
                metodoPagamento: metodoPuro 
            }
        });

        res.json({
            sucesso: true,
            pedidoId: novoPedido.id,
            valorFinal: novoPedido.valorTotal,
            pix: {
                payload: dadosAsaas.payload,           
                encodedImage: dadosAsaas.encodedImage  
            }, 
            linkPagamento: dadosAsaas.invoiceUrl       
        });

    } catch (e) {
        console.error("Erro checkout:", e);
        res.status(500).json({ erro: e.message });
    }
});


// ==============================================================
// 🤖 WEBHOOK ASAAS (RECEBE CONFIRMAÇÃO DE PAGAMENTO)
// ==============================================================
// ==============================================================
// 🤖 WEBHOOK ASAAS (ATUALIZAÇÃO AUTOMÁTICA)
// ==============================================================
app.post('/api/webhook/asaas', async (req, res) => {
    try {
        // 1. SEGURANÇA
        const tokenRecebido = req.headers['asaas-access-token'];
        if (tokenRecebido !== process.env.ASAAS_WEBHOOK_TOKEN) {
            return res.status(401).json({ error: 'Token inválido' });
        }

        const { event, payment } = req.body;
        console.log(`🔔 Webhook: ${event} | ID: ${payment.id}`);

        // 2. VERIFICA SE O PAGAMENTO FOI CONFIRMADO
        if (event === 'PAYMENT_CONFIRMED' || event === 'PAYMENT_RECEIVED') {
            
            // 🟢 ATUALIZAÇÃO: Busca pelo ID do Pagamento OU pelo ID do Link
            const pedido = await prisma.pedido.findFirst({
                where: { 
                    OR: [
                        { asaasId: payment.id },          // Se foi cobrança direta
                        { asaasId: payment.paymentLink }  // Se foi Link de Pagamento
                    ]
                }
            });

            if (!pedido) {
                console.log("⚠️ Pedido não encontrado para este pagamento.");
                return res.json({ received: true });
            }

            // Evita processar duas vezes se já estiver aprovado
            if (pedido.status === 'APROVADO' || pedido.status === 'PAGO') {
                return res.json({ received: true });
            }

            // =================================================
            // 3. ATUALIZAÇÕES NO BANCO DE DADOS
            // =================================================
            
            // A. Atualiza Status do Pedido
            await prisma.pedido.update({
                where: { id: pedido.id },
                data: { status: 'APROVADO' }
            });
            await enviarPedidoParaTiny(pedido);

            // B. Libera Comissão do Afiliado (se tiver)
            if (pedido.afiliadoId && pedido.comissaoGerada > 0) {
                await prisma.afiliado.update({
                    where: { id: pedido.afiliadoId },
                    data: { saldo: { increment: pedido.comissaoGerada } }
                });
                console.log(`💰 Comissão liberada: R$ ${pedido.comissaoGerada}`);
            }

            // C. Baixa no Estoque
            try {
                const listaItens = JSON.parse(pedido.itens);
                for (const item of listaItens) {
                    await prisma.produto.update({
                        where: { id: item.id },
                        data: { estoque: { decrement: item.qtd } }
                    });
                }
                console.log("📦 Estoque atualizado!");
            } catch (err) {
                console.error("Erro ao baixar estoque:", err);
            }

            console.log(`✅ PEDIDO #${pedido.id} APROVADO COM SUCESSO!`);
        }

        res.json({ received: true });

    } catch (error) {
        console.error("Erro Fatal no Webhook:", error);
        res.status(500).json({ error: 'Erro interno' });
    }
});

// ROTA PARA O DASHBOARD DO AFILIADO (Cards de Resumo)
app.get('/afiliado/estatisticas', authenticateToken, async (req, res) => {
    try {
        const { inicio, fim } = req.query; // Datas enviadas pelo filtro do dashboard
        const afiliadoId = req.user.id; // Pegando o ID do afiliado logado pelo token

        // Filtro de data básico
        const filtroData = {};
        if (inicio && fim) {
            filtroData.createdAt = {
                gte: new Date(inicio + "T00:00:00Z"),
                lte: new Date(fim + "T23:59:59Z")
            };
        }

        // Busca pedidos APROVADOS ou ENTREGUES para não somar lixo/cancelados
        const pedidos = await prisma.pedido.findMany({
            where: {
                afiliadoId: afiliadoId,
                status: { in: ['APROVADO', 'ENTREGUE'] },
                ...filtroData
            },
            select: {
                valorTotal: true,
                comissaoGerada: true
            }
        });

        // Somatória manual dos valores
        const totalVendas = pedidos.reduce((acc, p) => acc + parseFloat(p.valorTotal || 0), 0);
        const lucroLiquido = pedidos.reduce((acc, p) => acc + parseFloat(p.comissaoGerada || 0), 0);

        res.json({
            vendasTotais: totalVendas,
            lucroLiquido: lucroLiquido
        });

    } catch (e) {
        console.error("Erro nas estatísticas:", e);
        res.status(500).json({ erro: "Erro ao carregar dados do período." });
    }
});



// 1. Rota para iniciar a autorização
// Você vai acessar: seu-site.com/admin/tiny/autorizar
app.get('/admin/tiny/autorizar', (req, res) => {
    const clientId = process.env.TINY_CLIENT_ID;
    const redirectUri = encodeURIComponent(process.env.TINY_REDIRECT_URI);
    
    // URL oficial da documentação que você enviou
    const url = `https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/auth?client_id=${clientId}&redirect_uri=${redirectUri}&scope=openid&response_type=code`;
    
    res.redirect(url);
});

// 2. Rota de Callback (Onde o Tiny devolve o 'code')
// Essa URL deve ser EXATAMENTE a mesma que você cadastrou no painel do Tiny
app.get('/tiny/callback', async (req, res) => {
    const { code } = req.query;

    if (!code) return res.send("Erro: Código não fornecido pelo Tiny.");

    try {
        const params = new URLSearchParams();
        params.append('grant_type', 'authorization_code');
        params.append('client_id', process.env.TINY_CLIENT_ID);
        params.append('client_secret', process.env.TINY_CLIENT_SECRET);
        params.append('redirect_uri', process.env.TINY_REDIRECT_URI);
        params.append('code', code);

        const response = await axios.post('https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/token', params);

        const { access_token, refresh_token, expires_in } = response.data;
        
        // Calcula quando o token vai vencer (expires_in vem em segundos, ex: 14400 = 4h)
        const dataExpiracao = new Date(Date.now() + (expires_in * 1000));

        // Salva no banco (usando upsert para criar ou atualizar o ID 1)
        await prisma.tinyConfig.upsert({
            where: { id: 1 },
            update: { 
                accessToken: access_token, 
                refreshToken: refresh_token, 
                expiresAt: dataExpiracao 
            },
            create: { 
                id: 1, 
                accessToken: access_token, 
                refreshToken: refresh_token, 
                expiresAt: dataExpiracao 
            }
        });

        res.send("<h1>✅ Sucesso!</h1><p>Seu sistema agora está conectado ao Tiny V3.</p>");

    } catch (error) {
        console.error("Erro no Callback:", error.response?.data || error.message);
        res.status(500).send("Erro ao obter token. Verifique os logs.");
    }
});

app.get('/admin/sincronizar-tiny/:referencia', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    
    const { referencia } = req.params;
    const TOKEN = process.env.TINY_TOKEN;

    try {
        const url = `https://api.tiny.com.br/api2/produto.obter.php?token=${TOKEN}&formato=json&codigo=${referencia}`;
        const response = await axios.get(url);

        if (response.data.retorno.status === 'OK') {
            const prodTiny = response.data.retorno.produto;

            // Atualiza o seu banco de dados com os dados novos do Tiny
            const produtoAtualizado = await prisma.produto.update({
                where: { referencia: referencia }, // Certifique-se que 'referencia' é UNIQUE no prisma
                data: {
                    preco_custo: parseFloat(prodTiny.preco_custo),
                    estoque: parseInt(prodTiny.quantidade_estoque),
                    // Você pode sincronizar o preço de venda também se quiser
                    // preco_novo: parseFloat(prodTiny.preco) 
                }
            });

            res.json({ mensagem: "Sincronizado com sucesso!", produto: produtoAtualizado });
        } else {
            res.status(404).json({ erro: "Produto não encontrado no Tiny" });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ erro: "Erro ao conectar com Tiny" });
    }
});

app.post('/enviar-produto', async (req, res) => {
    try {
        // Você chama a função e ela resolve tudo (vencimento, banco, renovação) sozinha!
        const token = await getValidToken();

        // Agora usa o token no Header Bearer (Padrão V3)
        const response = await axios.post('https://api.tiny.com.br/public-api/v3/produtos', seuObjeto, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ erro: error.message });
    }
});
// Rota para enviar um produto do seu banco para o Tiny

app.post('/admin/teste-v3-direto', authenticateToken, async (req, res) => {
    try {
        const tokenV3 = "COLE_AQUI_SEU_TOKEN_DA_IMAGEM_6b9...";

        const produtoTeste = {
            nome: "PRODUTO TESTE V3",
            codigo: "TESTE-" + Date.now(),
            preco: 125.50,
            unidade: "UN",
            tipo: "P"
        };

        const response = await axios.post('https://api.tiny.com.br/public-api/v3/produtos', produtoTeste, {
            headers: {
                'Authorization': `Bearer ${tokenV3}`,
                'Content-Type': 'application/json'
            }
        });

        res.json({ msg: "FINALMENTE FUNCIONOU!", data: response.data });
    } catch (error) {
        res.status(500).json({ erro: error.response?.data || error.message });
    }
});

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));



// ROTA: ENVIAR PRODUTO DO SITE PARA O TINY (CORRIGIDA V3 FINAL)
app.post('/admin/enviar-ao-tiny/:id', authenticateToken, async (req, res) => {
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    if (req.user.role !== 'admin') return res.sendStatus(403);

    try {
        const id = parseInt(req.params.id);
        const produto = await prisma.produto.findUnique({ where: { id } });

        if (!produto) return res.status(404).json({ erro: "Produto não encontrado" });

        let tokenFinal;
        try { tokenFinal = await getValidToken(); } 
        catch (e) { return res.status(401).json({ erro: "Token expirado. Reautorize." }); }

        // Limpeza de Strings
        const removerAcentos = (str) => str ? str.normalize("NFD").replace(/[\u0300-\u036f]/g, "") : "";
        const precoVenda = parseFloat(String(produto.preco_novo || produto.preco || 0).replace(',', '.'));
        const precoCusto = parseFloat(String(produto.preco_custo || 0).replace(',', '.'));
        const estoque = parseInt(produto.estoque || 0);

        // === CORREÇÃO DOS CAMPOS E TIPOS ===
        const payloadCriacao = {
            sku: String(produto.referencia || produto.sku || `PROD-${id}`).trim(),
            
            // CORREÇÃO 1: O campo obrigatório é 'descricao', não 'nome'
            descricao: removerAcentos(produto.titulo).substring(0, 120).trim(), 
            
            tipo: "S",
            situacao: "A",
            unidade: "UN",
            origem: "0",
            ncm: String(produto.ncm || "87089990").replace(/\./g, ""),
            
            precos: {
                preco: precoVenda,
                precoCusto: precoCusto,
                precoPromocional: 0
            },
            
            estoque: {
                // CORREÇÃO 2: Enviar true/false (booleano) em vez de "S"/"N"
                controlar: true, 
                sobEncomenda: false
            }
        };

        console.log(`🚀 (1/3) Criando ${payloadCriacao.sku} no Tiny...`);

        // PASSO 1: POST DE CRIAÇÃO
        const response = await axios.post('https://api.tiny.com.br/public-api/v3/produtos', payloadCriacao, {
            headers: { 'Authorization': `Bearer ${tokenFinal}`, 'Content-Type': 'application/json' }
        });

        const idTiny = response.data.data?.id || response.data.id;
        console.log(`✅ Criado! ID Tiny: ${idTiny}. Aguardando 3s...`);
        
        await sleep(3000); 

        // PASSO 2: LANÇAR ESTOQUE (Se houver)
        if (estoque > 0) {
            try {
                const payloadEstoque = {
                    estoque: {
                        quantidade: estoque,
                        tipo: "B",
                        observacao: "Carga Inicial Site",
                        custoUnitario: precoCusto > 0 ? precoCusto : precoVenda
                    }
                };

                await axios.post(`https://api.tiny.com.br/public-api/v3/estoque/${idTiny}`, payloadEstoque, { 
                    headers: { 'Authorization': `Bearer ${tokenFinal}` } 
                });
                console.log(`✅ Estoque lançado.`);
            } catch (errEstoque) {
                console.error("⚠️ Erro Estoque:", errEstoque.message);
            }
        }

        // PASSO 3: VINCULAR
        await prisma.produto.update({ 
            where: { id: id }, 
            data: { tinyId: String(idTiny) } 
        });
        
        return res.json({ sucesso: true, msg: "Produto enviado com sucesso!", tinyId: idTiny });

    } catch (error) {
        const erroMsg = error.response?.data?.erros?.[0]?.mensagem || error.response?.data?.mensagem || error.message;
        const detalhes = JSON.stringify(error.response?.data?.detalhes || "");
        console.error("❌ Erro ao enviar:", erroMsg, detalhes);
        res.status(500).json({ erro: `Tiny rejeitou: ${erroMsg} ${detalhes}` });
    }
});

// ROTA DE TESTE: Tenta descobrir qual a URL de estoque correta
app.get('/admin/teste-estoque/:idTiny', async (req, res) => {
    const idTiny = req.params.idTiny;
    const qtdTeste = 15; // Vamos tentar lançar 15 unidades

    try {
        const token = await getValidToken();
        let log = `<h1>🕵️ Diagnóstico de Estoque para ID: ${idTiny}</h1>`;

        // TENTATIVA 1: URL Geral (POST /estoque)
        log += "<h3>Tentativa 1: POST /estoque</h3>";
        try {
            await axios.post('https://api.tiny.com.br/public-api/v3/estoque', {
                produto: { id: idTiny },
                quantidade: qtdTeste,
                tipo: "E",
                observacao: "Teste 1"
            }, { headers: { 'Authorization': `Bearer ${token}` } });
            log += "<p style='color:green'>✅ SUCESSO! A URL certa é a Geral.</p>";
        } catch (e) {
            log += `<p style='color:red'>❌ Falhou (Erro ${e.response?.status})</p>`;
        }

        // TENTATIVA 2: URL Específica (POST /produtos/ID/estoque)
        log += "<h3>Tentativa 2: POST /produtos/{id}/estoque</h3>";
        try {
            await axios.post(`https://api.tiny.com.br/public-api/v3/produtos/${idTiny}/estoque`, {
                quantidade: qtdTeste,
                tipo: "E",
                observacao: "Teste 2"
            }, { headers: { 'Authorization': `Bearer ${token}` } });
            log += "<p style='color:green'>✅ SUCESSO! A URL certa é a Específica.</p>";
        } catch (e) {
            log += `<p style='color:red'>❌ Falhou (Erro ${e.response?.status})</p>`;
        }

        // TENTATIVA 3: URL Direta (PUT /estoque/ID)
        log += "<h3>Tentativa 3: PUT /estoque/{id}</h3>";
        try {
            await axios.put(`https://api.tiny.com.br/public-api/v3/estoque/${idTiny}`, {
                saldo: qtdTeste
            }, { headers: { 'Authorization': `Bearer ${token}` } });
            log += "<p style='color:green'>✅ SUCESSO! A URL certa é PUT direto.</p>";
        } catch (e) {
            log += `<p style='color:red'>❌ Falhou (Erro ${e.response?.status})</p>`;
        }

        res.send(log);

    } catch (error) {
        res.send("Erro geral no teste: " + error.message);
    }
});

// ROTA DE EMERGÊNCIA: Reseta o status de integração de TODOS os produtos
// ROTA DE RESET - Versão Blindada
app.get('/admin/resetar-status-tiny', authenticateToken, async (req, res) => {
    // Verifica se o usuário existe antes de ler o 'role' para evitar o Erro 500
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).send("Acesso negado: Somente administradores.");
    }

    try {
        console.log("🔄 Iniciando reset de status do Tiny...");

        // Limpa o tinyId de todos os produtos
        const resultado = await prisma.produto.updateMany({
            data: { tinyId: null } 
        });

        console.log(`✅ Reset concluído. ${resultado.count} produtos liberados.`);
        res.send(`Sucesso! ${resultado.count} produtos foram resetados e estão prontos para reenvio.`);
        
    } catch (error) {
        console.error("❌ Erro no reset:", error);
        res.status(500).send("Erro interno ao tentar resetar os produtos.");
    }
});

// =================================================================
// 🔄 ROTA DE SINCRONIZAÇÃO (ID LOCAL = ID TINY)
// =================================================================
app.get('/admin/importar-do-tiny', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);

    try {
        const tokenFinal = await getValidToken();
        let pagina = 1;
        let processados = 0;
        let continuarBuscando = true;
        const idsProcessados = new Set(); 
        const sleep = (ms) => new Promise(r => setTimeout(r, ms));

        console.log("🔄 Iniciando Sincronização Suprema...");

        while (continuarBuscando) {
            const limite = 100;
            const offset = (pagina - 1) * limite; 
            const url = `https://api.tiny.com.br/public-api/v3/produtos?offset=${offset}&pagina=${pagina}&page=${pagina}&limite=${limite}&limit=${limite}&situacao=A`;
            
            let response;
            let sucessoBuscaPagina = false;

            // 🛡️ ESCUDO 1: Protege a busca da PÁGINA 
            while (!sucessoBuscaPagina) {
                try {
                    response = await axios.get(url, { headers: { 'Authorization': `Bearer ${tokenFinal}` } });
                    sucessoBuscaPagina = true;
                } catch (erroPagina) {
                    if (erroPagina.response?.status === 429) {
                        console.log(`⏳ Tiny 429 (Página). Aguardando 10s...`);
                        await sleep(10000); 
                    } else {
                        throw erroPagina; 
                    }
                }
            }

            const corpo = response.data;
            const dados = corpo.data || corpo; 
            const itens = dados.itens || [];

            console.log(`📄 Lendo Página ${pagina} (Tiny retornou ${itens.length} itens)`);

            if (itens.length === 0) {
                console.log("🏁 Página vazia. Finalizando.");
                break;
            }

            let repetiuProduto = false;

            for (const item of itens) {
                const idTinyReal = parseInt(item.id); 
                const sku = item.sku || item.codigo; 

                if (!sku) continue;

                if (idsProcessados.has(idTinyReal)) {
                    console.log(`🚨 ERRO DO TINY: O produto [${idTinyReal}] repetiu. Parando.`);
                    repetiuProduto = true;
                    break; 
                }
                idsProcessados.add(idTinyReal);

                await sleep(600); 

                // 🛡️ ESCUDO 2: Garante que NENHUM produto seja pulado por causa de 429
                let sucessoDetalhe = false;
                let p = null;

                while (!sucessoDetalhe) {
                    try {
                        const detalhe = await axios.get(`https://api.tiny.com.br/public-api/v3/produtos/${idTinyReal}`, {
                            headers: { 'Authorization': `Bearer ${tokenFinal}` }
                        });
                        p = detalhe.data.data || detalhe.data;
                        sucessoDetalhe = true; // Deu certo, sai do loop de tentativa
                    } catch (errDet) {
                        if (errDet.response?.status === 429) {
                            console.log(`⏳ Tiny 429 no produto. Pausando 5s e TENTANDO DE NOVO o SKU ${sku}...`);
                            await sleep(5000);
                        } else {
                            console.error(`❌ Erro grave no SKU ${sku}:`, errDet.message);
                            break; // Se o erro não for 429, desiste desse produto e segue a vida
                        }
                    }
                }

                // Se p for null, significa que deu um erro grave que não era 429, então pula esse item
                if (!p) continue;

                // Salva ou atualiza no banco
                const novoPreco = parseFloat(p.precos?.preco || p.preco || 0);
                const novoCusto = parseFloat(p.precos?.precoCusto || p.precoCusto || p.precos?.preco_custo || 0);
                const novoEstoque = parseInt(p.estoque?.quantidade || p.saldo || 0);

                const produtoExistente = await prisma.produto.findUnique({
                    where: { id: idTinyReal } 
                });

                const dadosProduto = {
                    titulo: p.nome || item.descricao,
                    sku: sku,
                    referencia: sku,
                    preco_novo: novoPreco,
                    preco_custo: novoCusto,
                    estoque: novoEstoque,
                    tinyId: String(idTinyReal), 
                    //categoria: p.categoria || "Geral"
                };

                if (produtoExistente) {
                    await prisma.produto.update({ where: { id: idTinyReal }, data: dadosProduto });
                    console.log(`✅ [${idTinyReal}] ${sku} Atualizado`);
                } else {
                    await prisma.produto.create({ data: { id: idTinyReal, ...dadosProduto, categoria: p.categoria || "Geral", imagem: "https://placehold.co/600x400?text=Sem+Foto" } });
                    console.log(`✨ [${idTinyReal}] ${sku} Criado!`);
                }
                
                processados++;
            }

            if (repetiuProduto || itens.length < 100) {
                console.log("🏁 Chegamos ao fim da lista real de produtos.");
                continuarBuscando = false;
            } else {
                pagina++; 
            }
        }

        res.json({ sucesso: true, msg: `Sincronização Finalizada! ${processados} produtos processados.` });

    } catch (error) {
        console.error("❌ Erro fatal:", error.response?.data || error.message);
        res.status(500).json({ erro: "Erro na sincronização" });
    }
});

// =================================================================
// 🚀 ROTA: CRIAR PEDIDO NO TINY (AGORA USANDO O SERVICE CORRETO)
// =================================================================
app.post('/admin/tiny/criar-pedido', async (req, res) => {
    try {
        const { itensCarrinho, cliente, valorFrete, valorTotal } = req.body;

        console.log("🚀 ROTA: Recebendo pedido para enviar ao Tiny:", cliente.nome);
        console.log("🔍 ESPIÃO SERVER: O que chegou do Frontend?");
        console.log("Nome:", cliente.nome);
        console.log("Endereço:", cliente.endereco);
        console.log("Número:", cliente.numero);
        console.log("Bairro:", cliente.bairro);
        console.log("Cidade (Front):", cliente.cidade); // <--- ONDE DEVIA ESTAR A CIDADE
        console.log("CEP:", cliente.cep);

        // 1. Mapeamos o JSON do Frontend para o formato que o Service entende
        // O Service espera um objeto parecido com o do Banco de Dados (Prisma)
        const pedidoFormatado = {
            id: Date.now(), // ID temporário para logs
            valorTotal: valorTotal,
            metodoPagamento: "CARTAO/PIX", // Ou pegar do body se tiver
            
            // Mapeamento dos Dados do Cliente
            clienteNome: cliente.nome,
            clienteDoc: cliente.documento || cliente.cpf,
            clienteEmail: cliente.email,
            clienteTelefone: cliente.telefone,
            
            // ✅ AQUI GARANTIMOS QUE O ENDEREÇO VAI PRO SERVICE
            clienteEndereco: cliente.endereco, // Rua
            clienteNumero: cliente.numero,
            clienteBairro: cliente.bairro,
            clienteCidade: cliente.cidade,     // Maceio
            clienteUf: cliente.uf,             // AL
            clienteCep: cliente.cep,

            // Itens
            itens: itensCarrinho // O Service já sabe lidar com array JSON
        };

        // 2. CHAMAMOS O ESPECIALISTA (O arquivo tinyService.js)
        // Ele vai fazer o PUT (Atualizar endereço) e depois criar o pedido com Juros
        const resultado = await enviarPedidoParaTiny(pedidoFormatado);

        if (resultado.success) {
            res.json({ sucesso: true, numero: resultado.tinyId }); // Retorna o ID ou Número
        } else {
            res.status(500).json({ erro: resultado.erro });
        }

    } catch (error) {
        console.error("❌ Erro na rota do Tiny:", error.message);
        res.status(500).json({ erro: "Erro interno ao processar Tiny." });
    }
});
// ROTA: RAIO-X COMPLETO (SEM FILTROS)
app.get('/admin/tiny/ver-pedido/:id', async (req, res) => {
    try {
        const tokenFinal = await getValidToken();
        const idPedido = req.params.id;

        const response = await axios.get(
            `https://api.tiny.com.br/public-api/v3/pedidos/${idPedido}`,
            { headers: { 'Authorization': `Bearer ${tokenFinal}` } }
        );

        // Manda o RAW (Cru) para a tela e para o Log
        console.log("📦 JSON COMPLETO DO TINY:", JSON.stringify(response.data, null, 2));
        res.send(response.data); 

    } catch (error) {
        res.status(500).send("Erro: " + (error.response?.data ? JSON.stringify(error.response.data) : error.message));
    }
});


async function buscarClienteCerteiro(cpf, token) {
    const cpfLimpo = cpf.replace(/\D/g, '');
    const cpfFormatado = cpfLimpo.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");

    try {
        // Usamos o parâmetro pesquisa que você confirmou que funciona no site
        const res = await axios.get(`https://api.tiny.com.br/public-api/v3/contatos`, {
            params: { pesquisa: cpfFormatado },
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const lista = res.data.data || [];
        if (Array.isArray(lista) && lista.length > 0) {
            // Conferência de segurança
            const achou = lista.find(c => (c.cpfCnpj || c.cpf_cnpj || '').replace(/\D/g, '') === cpfLimpo);
            return achou ? achou.id : null;
        }
    } catch (e) {
        console.log("⚠️ Erro na busca rápida:", e.message);
    }
    return null;
}
// Função auxiliar (mantenha ou adicione se não tiver)
function checarSeAchou(response) {
    if (response.data && response.data.data && response.data.data.length > 0) {
        console.log(`✅ ACHEI! ID: ${response.data.data[0].id} - Nome: ${response.data.data[0].nome}`);
        return true;
    }
    return false;
}

// Função auxiliar para ver se o Tiny devolveu algo
function checarSeAchou(response) {
    if (response.data && response.data.data && response.data.data.length > 0) {
        console.log(`✅ ACHEI! ID: ${response.data.data[0].id} - Nome: ${response.data.data[0].nome}`);
        return true;
    }
    return false;
}

async function resolverClienteParaVenda(cliente, token) {
    const cpfLimpo = (cliente.documento || cliente.cpf || '').replace(/\D/g, '');
    const nomeCliente = cliente.nome;

    try {
        // 1. BUSCA PELO CPF (Mais seguro que nome)
        console.log(`🔎 Buscando por CPF/Pesquisa: ${cpfLimpo}`);
        const res = await axios.get(`https://api.tiny.com.br/public-api/v3/contatos`, {
            params: { pesquisa: cpfLimpo }, // A busca por pesquisa pega CPF direto
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const lista = res.data.data || [];
        if (lista.length > 0) {
            console.log(`✅ Achei o cliente! ID: ${lista[0].id}`);
            return lista[0].id;
        }

        // 2. SE NÃO ACHOU, ESPERA UM POUCO E TENTA CRIAR
        // Mas atenção: se der 429 aqui, o Tiny está bloqueando seu POST
        console.log("⚠️ Não encontrado. Tentando cadastrar...");
        const resCriar = await axios.post(`https://api.tiny.com.br/public-api/v3/contatos`, {
            nome: nomeCliente,
            cpfCnpj: cpfLimpo,
            tipoPessoa: 'F',
            situacao: "A"
        }, { headers: { 'Authorization': `Bearer ${token}` } });
        
        return resCriar.data.data?.id || resCriar.data.id;

    } catch (error) {
        const msgErro = JSON.stringify(error.response?.data || "");
        
        // 3. O PULO DO GATO: Se der erro de "já existe" ou 400, pesca o ID na mensagem
        if (msgErro.includes("existe") || msgErro.includes("cadastrado") || error.response?.status === 400) {
            const matchId = msgErro.match(/(\d{9,})/);
            if (matchId) {
                console.log(`✅ ID Pescado do erro: ${matchId[1]}`);
                return matchId[1];
            }
        }
        
        console.error("❌ Erro no Resolver:", msgErro);
        return null;
    }
}

// ==========================================
// CRIAR CLIENTE (COM DELAY AUMENTADO)
// ==========================================
async function criarClienteNoTiny(dadosCliente, token) {
    // Proteção contra o erro que você recebeu:
    if (!dadosCliente) {
        console.error("❌ Erro: dadosCliente chegou vazio na função!");
        return null;
    }

    const cpfLimpo = (dadosCliente.documento || dadosCliente.cpf || '').replace(/\D/g, '');
    
    const payload = {
        nome: dadosCliente.nome,
        cpfCnpj: cpfLimpo,
        tipoPessoa: cpfLimpo.length > 11 ? 'J' : 'F',
        situacao: "A"
        // adicione endereco se necessário...
    };

    try {
        console.log("📤 Tentando criar cliente no Tiny...");
        const response = await axios.post(
            `https://api.tiny.com.br/public-api/v3/contatos`,
            payload,
            { headers: { 'Authorization': `Bearer ${token}` } }
        );
        return response.data.data?.id || response.data.id;

    } catch (error) {
        const respostaTiny = JSON.stringify(error.response?.data || "");
        
        // 🔎 O PULO DO GATO: Se o cliente existe, o Tiny V3 retorna erro 400 
        // com uma mensagem tipo: "O contato 890236518 já está cadastrado."
        if (respostaTiny.includes("existe") || respostaTiny.includes("cadastrado") || error.response?.status === 400) {
            console.log("⚠️ Cliente já cadastrado. Pescando ID na resposta...");

            // Expressão regular para pegar qualquer sequência de 9 dígitos (o ID)
            const matchId = respostaTiny.match(/(\d{9,})/);
            
            if (matchId && matchId[1]) {
                console.log(`✅ ID PESCADO: ${matchId[1]}`);
                return matchId[1];
            }

            // Se não pescou no erro, tenta a última cartada: buscar pelo nome EXATO
            console.log("🕵️ ID não estava na mensagem. Tentando busca por nome exato...");
            const resNome = await axios.get(`https://api.tiny.com.br/public-api/v3/contatos?pesquisa=${encodeURIComponent(dadosCliente.nome)}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const lista = resNome.data.data || [];
            const achou = lista.find(c => (c.cpfCnpj || "").replace(/\D/g, '') === cpfLimpo);
            return achou ? achou.id : null;
        }

        console.error("❌ Erro técnico no Tiny:", respostaTiny);
        return null;
    }
}

// ==========================================
// ROTA DE DIAGNÓSTICO PÚBLICA (SEM SENHA)
// ==========================================
// ==========================================================
// 🧪 LABORATÓRIO: TESTA CPF, PARÂMETROS E BUSCA POR NOME
// ==========================================================
app.get('/teste-parametro/:cpf', async (req, res) => {
    const cpfRaw = req.params.cpf;
    const cpfLimpo = cpfRaw.replace(/\D/g, '');
    const cpfFormatado = cpfLimpo.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
    
    // Pega o nome da URL (?nome=Rafaela) ou usa um padrão para teste
    const nomeTeste = req.query.nome || "Rafaela"; 

    const resultados = [];
    const token = await getValidToken();

    console.log(`\n🧪 INICIANDO LABORATÓRIO...`);
    console.log(`🎯 CPF Alvo: ${cpfFormatado}`);
    console.log(`👤 Nome Alvo: ${nomeTeste}`);

    // FUNÇÃO AUXILIAR DE TESTE
    const testarMetodo = async (titulo, params) => {
        let status = "❌ FALHOU";
        let detalhe = "Zero resultados";
        let id = null;

        try {
            // Delay pequeno para não travar a API
            await new Promise(r => setTimeout(r, 500));

            const res = await axios.get(`https://api.tiny.com.br/public-api/v3/contatos`, {
                params: params,
                headers: { 'Authorization': `Bearer ${token}` }
            });

            const lista = res.data.data || [];
            
            if (Array.isArray(lista) && lista.length > 0) {
                // Procura o CPF na lista retornada
                const achou = lista.find(c => {
                    const doc = (c.cpfCnpj || c.cpf_cnpj || '').replace(/\D/g, '');
                    return doc === cpfLimpo;
                });

                if (achou) {
                    status = "✅ SUCESSO";
                    detalhe = `Encontrado ID: ${achou.id} (${achou.nome})`;
                    id = achou.id;
                } else {
                    status = "⚠️ INCONCLUSIVO";
                    detalhe = `Trouxe ${lista.length} nomes, mas CPF não bateu.`;
                }
            }
        } catch (e) {
            status = "🔥 ERRO API";
            detalhe = e.response?.status || e.message;
        }

        resultados.push({ metodo: titulo, status, detalhe, id_encontrado: id });
        console.log(`👉 [${titulo}]: ${status}`);
    };

    try {
        // 1. TESTE: CPF FORMATADO (Parâmetro cpf_cnpj snake_case)
        await testarMetodo("1. CPF (cpf_cnpj)", { cpf_cnpj: cpfFormatado });

        // 2. TESTE: CPF FORMATADO (Parâmetro cpfCnpj camelCase)
        await testarMetodo("2. CPF (cpfCnpj)", { cpfCnpj: cpfFormatado });

        // 3. TESTE: PESQUISA GERAL (CPF)
        await testarMetodo("3. Pesquisa Geral (CPF)", { pesquisa: cpfFormatado });

        // 4. TESTE: BUSCA POR NOME (A ESTRATÉGIA "PENEIRA")
        // Aqui buscamos pelo nome e o código tenta achar o CPF dentro
        await testarMetodo(`4. Busca por Nome (${nomeTeste})`, { pesquisa: nomeTeste });

        res.json({
            alvo: { cpf: cpfFormatado, nome_pesquisado: nomeTeste },
            resultados: resultados
        });

    } catch (error) {
        res.status(500).json({ erro: error.message });
    }
});

// Rota para gerar lista de compras (Produtos com estoque baixo ou geral)
app.get('/api/admin/lista-compras', async (req, res) => {
    try {
        // Busca todos os produtos ordenados pelo nome
        // DICA: Se quiser só os com estoque baixo, adicione: where: { estoque: { lte: 5 } }
        const produtos = await prisma.produto.findMany({
            orderBy: { titulo: 'asc' },
            select: {
                id: true,
                titulo: true,
                referencia: true,
                fabricante: true,
                estoque: true
            }
        });

        res.json(produtos);
    } catch (error) {
        console.error("Erro ao buscar lista:", error);
        res.status(500).json({ error: "Erro ao buscar produtos" });
    }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});