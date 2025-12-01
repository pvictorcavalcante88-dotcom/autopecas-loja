const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');
const path = require('path'); // <--- 1. IMPORTANTE: Importar o Path

const prisma = new PrismaClient();
const app = express();

app.use(cors());
app.use(express.json());

// =================================================================
// 🌐 SERVIR O SITE (FRONTEND) - A PARTE QUE FALTOU
// =================================================================
// Isso diz ao servidor: "Se alguém pedir index.html, css ou js, entregue!"
app.use(express.static(path.join(__dirname, '.'))); 

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

// =================================================================
// 🔑 ROTA DE LOGIN ADMIN (ATUALIZADA)
// =================================================================
app.post('/login', async (req, res) => {
    const { email, senha } = req.body;
    
    // Debug: Vai mostrar no terminal o que você digitou (ajuda a achar erro de digitação)
    console.log("Tentativa de Login Admin recebida:", email, " | Senha:", senha);

    // OPÇÃO 1: Credenciais Padrão
    if (email === "admin@autopecas.com" && senha === "admin123") {
        const token = jwt.sign({ role: 'admin' }, SECRET_KEY, { expiresIn: '12h' });
        return res.json({ token });
    }

    // OPÇÃO 2: Credencial de Emergência (TESTE ESSA!)
    if (email === "admin" && senha === "admin") {
        const token = jwt.sign({ role: 'admin' }, SECRET_KEY, { expiresIn: '12h' });
        return res.json({ token });
    }

    res.status(401).json({ erro: "Credenciais inválidas" });
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
            margem: afiliado.margem 
        });
    } catch (error) {
        res.status(500).json({ erro: "Erro no servidor" });
    }
});

// =================================================================
// 🔎 ROTA DE BUSCA
// =================================================================
app.get('/search', async (req, res) => {
    try {
        const { q, categoria } = req.query;
        let whereClause = {};
        let condicoesAnd = [];

        if (categoria) condicoesAnd.push({ categoria: { contains: categoria } });

        if (q) {
            const termos = q.trim().split(/\s+/);
            termos.forEach(termo => {
                condicoesAnd.push({
                    OR: [
                        { titulo: { contains: termo } },
                        { referencia: { contains: termo } },
                        { carros: { contains: termo } },
                        { pesquisa: { contains: termo } },
                        { fabricante: { contains: termo } },
                        { categoria: { contains: termo } }
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
    } catch (error) { res.json([]); }
});

// =================================================================
// 📂 ROTAS DE ORÇAMENTOS
// =================================================================
app.post('/orcamentos', authenticateToken, async (req, res) => {
    try {
        const { nome, itens, total } = req.body;
        const afiliadoId = req.user.id; 

        const novo = await prisma.orcamento.create({
            data: { nome, itens: JSON.stringify(itens), total: parseFloat(total), afiliadoId }
        });
        res.json({ mensagem: "Salvo!", id: novo.id });
    } catch (e) { res.status(500).json({ erro: "Erro ao salvar." }); }
});

app.get('/afiliado/orcamentos', authenticateToken, async (req, res) => {
    try {
        const orcamentos = await prisma.orcamento.findMany({
            where: { afiliadoId: req.user.id },
            orderBy: { createdAt: 'desc' }
        });
        res.json(orcamentos);
    } catch (e) { res.status(500).json({ erro: "Erro ao buscar." }); }
});

app.delete('/orcamentos/:id', authenticateToken, async (req, res) => {
    try {
        await prisma.orcamento.deleteMany({ where: { id: parseInt(req.params.id), afiliadoId: req.user.id } });
        res.json({ mensagem: "Deletado" });
    } catch (e) { res.status(500).json({ erro: "Erro ao deletar." }); }
});

// =================================================================
// 📦 ROTAS DE PRODUTOS E CONFIG
// =================================================================
app.get('/products/:id', async (req, res) => {
    try {
        const produto = await prisma.produto.findUnique({ where: { id: parseInt(req.params.id) } });
        if (produto) res.json(produto);
        else res.status(404).json({ error: "Não encontrado" });
    } catch (e) { res.status(500).json({ error: "Erro" }); }
});

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

app.put('/afiliado/config', authenticateToken, async (req, res) => {
    try {
        await prisma.afiliado.update({
            where: { id: req.user.id },
            data: { margem: parseFloat(req.body.novaMargem) }
        });
        res.json({ success: true });
    } catch(e) { res.status(500).json({ erro: "Erro" }); }
});

app.get('/afiliado/check/:codigo', async (req, res) => {
    try {
        const afiliado = await prisma.afiliado.findUnique({ where: { codigo: req.params.codigo } });
        if (afiliado) res.json({ margem: afiliado.margem });
        else res.status(404).json({ erro: "Não encontrado" });
    } catch(e) { res.status(500).json({ erro: "Erro" }); }
});

app.get('/afiliado/dashboard', authenticateToken, async (req, res) => {
    try {
        const afiliado = await prisma.afiliado.findUnique({
            where: { id: req.user.id },
            include: { pedidos: true }
        });
        res.json(afiliado);
    } catch (e) { res.status(500).json({ erro: "Erro" }); }
});

app.post('/finalizar-pedido', async (req, res) => {
    try {
        const { cliente, itens, afiliadoCodigo } = req.body;
        let valorTotal = 0;
        let itensTexto = "";

        // Reconstroi total e texto
        itens.forEach(i => {
            valorTotal += (i.unitario * i.qtd); 
            itensTexto += `${i.qtd}x ${i.nome} (R$ ${i.unitario.toFixed(2)}) | `;
        });

        let dadosPedido = {
            clienteNome: cliente.nome,
            clienteEmail: cliente.email,
            clienteEndereco: cliente.endereco,
            valorTotal: valorTotal,
            itens: itensTexto
        };

        if (afiliadoCodigo) {
            const afiliado = await prisma.afiliado.findUnique({ where: { codigo: afiliadoCodigo } });
            if (afiliado) {
                dadosPedido.afiliadoId = afiliado.id;
                dadosPedido.comissaoGerada = valorTotal * 0.05; 
                await prisma.afiliado.update({
                    where: { id: afiliado.id },
                    data: { saldo: { increment: dadosPedido.comissaoGerada } }
                });
            }
        }

        const pedido = await prisma.pedido.create({ data: dadosPedido });
        res.json(pedido);

    } catch (error) { res.status(500).json({ erro: "Erro ao processar pedido" }); }
});

// ATUALIZAR DADOS BANCÁRIOS / PERFIL
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

// LER MENSAGENS DO ADMIN
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

// ROTA ADMIN: ENVIAR MENSAGEM PARA AFILIADO
app.post('/admin/mensagens', authenticateToken, async (req, res) => {
    // Verifica se é admin
    if (req.user.role !== 'admin') return res.sendStatus(403);

    try {
        const { afiliadoId, texto } = req.body;
        
        await prisma.mensagem.create({
            data: {
                texto: texto,
                afiliadoId: parseInt(afiliadoId)
            }
        });

        res.json({ success: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ erro: "Erro ao enviar mensagem." });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});