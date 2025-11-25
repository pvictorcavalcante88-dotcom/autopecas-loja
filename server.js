// ... (IMPORTAÇÕES E CONFIGURAÇÕES IGUAIS AO ANTERIOR) ...
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const path = require('path');

const prisma = new PrismaClient();
const app = express();
const PORT = process.env.PORT || 21109;
const JWT_SECRET = 'seu_segredo_jwt_super_secreto';

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); 

// ... (ROTAS DE PRODUTOS MANTIDAS IGUAIS) ...
app.get('/produtos', async (req, res) => { const p = await prisma.produto.findMany({ orderBy: { createdAt: 'desc' } }); res.json(p); });
app.get('/produtos/:id', async (req, res) => { const p = await prisma.produto.findUnique({ where: { id: parseInt(req.params.id) } }); if(!p) return res.status(404).json({erro:"Não encontrado"}); res.json(p); });
app.get('/search', async (req, res) => { const {q,categoria}=req.query; let w={}; if(categoria)w.categoria={equals:categoria}; if(q)w.OR=[{titulo:{contains:q}},{carros:{contains:q}},{referencia:{contains:q}}]; const p=await prisma.produto.findMany({where:w,orderBy:{createdAt:'desc'}}); res.json(p); });

// 1. Rota de Checagem de Margem (Mais segura)
app.get('/afiliado/check/:codigo', async (req, res) => {
    const { codigo } = req.params;
    try {
        const afiliado = await prisma.afiliado.findUnique({ where: { codigo } });
        // Se não achar ou não tiver margem, devolve 0
        const margemSegura = (afiliado && afiliado.aprovado && afiliado.margem) ? parseFloat(afiliado.margem) : 0;
        
        res.json({ margem: margemSegura, nome: afiliado ? afiliado.nome : '' });
    } catch (e) { res.status(500).json({ margem: 0 }); }
});

// 2. Rota de Finalizar Pedido (Mais robusta)
app.post('/finalizar-pedido', async (req, res) => {
    const { cliente, itens, afiliadoCodigo } = req.body; 

    if (!itens || itens.length === 0) {
        return res.status(400).json({ erro: "O carrinho está vazio!" });
    }

    try {
        const resultado = await prisma.$transaction(async (tx) => {
            let afiliado = null;
            let margemAplicada = 0;

            if (afiliadoCodigo) {
                afiliado = await tx.afiliado.findUnique({ where: { codigo: afiliadoCodigo } });
                if (afiliado && afiliado.aprovado) {
                    // Garante que é número. Se for null, vira 0.
                    margemAplicada = afiliado.margem ? parseFloat(afiliado.margem) : 0; 
                }
            }

            let totalPedidoReal = 0;
            let totalComissao = 0;

            for (const item of itens) {
                const prod = await tx.produto.findUnique({ where: { id: item.id } });
                if (!prod) throw new Error(`Produto (ID ${item.id}) não encontrado no banco.`);
                if (prod.estoque < item.quantidade) throw new Error(`Estoque insuficiente para: ${prod.titulo}`);
                
                await tx.produto.update({ where: { id: item.id }, data: { estoque: { decrement: item.quantidade } } });

                // Cálculo Protegido
                const precoBase = parseFloat(prod.preco_novo);
                const valorExtra = precoBase * (margemAplicada / 100); 
                const precoFinalItem = precoBase + valorExtra; 
                
                totalPedidoReal += precoFinalItem * item.quantidade;
                totalComissao += valorExtra * item.quantidade;
            }

            if (afiliado && totalComissao > 0) {
                await tx.afiliado.update({
                    where: { id: afiliado.id },
                    data: { saldo: { increment: totalComissao } }
                });
            }

            const novoPedido = await tx.pedido.create({
                data: {
                    clienteNome: cliente.nome,
                    clienteEmail: cliente.email,
                    clienteEndereco: cliente.endereco,
                    valorTotal: totalPedidoReal, 
                    itens: JSON.stringify(itens),
                    afiliadoId: afiliado ? afiliado.id : null,
                    comissaoGerada: totalComissao
                }
            });
            return novoPedido;
        });
        res.status(201).json(resultado);
    } catch (e) { 
        console.error("Erro no Pedido:", e); // Mostra o erro real no terminal
        res.status(400).json({ erro: e.message }); 
    }
});

// ... (ROTAS DE CADASTRO/LOGIN MANTIDAS) ...
app.post('/afiliado/register', async (req, res) => {
    const { nome, telefone, senha, codigo, chavePix } = req.body;
    try {
        const existe = await prisma.afiliado.findFirst({ where: { OR: [{ telefone }, { codigo }] } });
        if (existe) return res.status(400).json({ erro: "Dados já em uso." });
        await prisma.afiliado.create({ data: { nome, telefone, senha, codigo, chavePix } });
        res.status(201).json({ msg: "Aguarde aprovação." });
    } catch (e) { res.status(500).json({ erro: "Erro server" }); }
});
app.post('/afiliado/login', async (req, res) => {
    const { telefone, senha } = req.body;
    try {
        const afiliado = await prisma.afiliado.findUnique({ where: { telefone } });
        if (!afiliado || afiliado.senha !== senha) return res.status(401).json({ erro: "Inválido" });
        if (!afiliado.aprovado) return res.status(403).json({ erro: "Em análise." });
        const token = jwt.sign({ id: afiliado.id, role: 'afiliado' }, JWT_SECRET, { expiresIn: '30d' });
        res.json({ token, nome: afiliado.nome, codigo: afiliado.codigo });
    } catch (e) { res.status(500).json({ erro: "Erro server" }); }
});

// ===== NOVA ROTA: AFILIADO ATUALIZA MARGEM =====
app.put('/afiliado/config', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ erro: "Token ausente" });
    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const { novaMargem } = req.body;
        const margem = parseFloat(novaMargem);

        // Validação: Máximo 30%
        if (margem < 0 || margem > 30) return res.status(400).json({ erro: "A margem deve ser entre 0% e 30%." });

        await prisma.afiliado.update({
            where: { id: decoded.id },
            data: { margem: margem }
        });

        res.json({ msg: "Margem atualizada!" });
    } catch (e) { res.status(400).json({ erro: "Erro ao atualizar" }); }
});

// ... (RESTO DAS ROTAS ADMIN E DASHBOARD MANTIDAS) ...
// (Copie as rotas de admin/stats, admin/afiliados, etc do passo anterior aqui, elas não mudam a lógica, só o cálculo já foi feito no checkout)
app.get('/afiliado/dashboard', async (req, res) => {
    const authHeader = req.headers.authorization; if(!authHeader)return res.status(401).json({erro:"Token"});
    try{const d=jwt.verify(authHeader.split(' ')[1], JWT_SECRET); if(d.role!=='afiliado')throw new Error();
    const a=await prisma.afiliado.findUnique({where:{id:d.id},include:{pedidos:{orderBy:{createdAt:'desc'}}}}); res.json(a);}catch(e){res.status(401).json({erro:"Token"});}
});
function authMiddleware(req, res, next) { const authHeader = req.headers.authorization; if(!authHeader)return res.status(401).json({erro:"Token"}); try{req.admin=jwt.verify(authHeader.split(' ')[1], JWT_SECRET);next();}catch(e){res.status(401).json({erro:"Token"});} }
app.post('/admin/login', async (req, res) => { const {email,senha}=req.body; try{const a=await prisma.admin.findUnique({where:{email}}); if(!a||a.senha!==senha)return res.status(401).json({erro:"Erro"}); res.json({token:jwt.sign({id:a.id,email:a.email},JWT_SECRET,{expiresIn:'8h'})});}catch(e){res.status(500).json({erro:"Erro"});} });
app.get('/admin/afiliados', authMiddleware, async (req, res) => { try{const a=await prisma.afiliado.findMany({orderBy:{createdAt:'desc'},include:{pedidos:true}}); res.json(a);}catch(e){res.status(500).json({erro:"Erro"});} });
app.put('/admin/afiliados/:id/aprovar', authMiddleware, async (req, res) => { try{await prisma.afiliado.update({where:{id:parseInt(req.params.id)},data:{aprovado:true}}); res.json({msg:"Aprovado"});}catch(e){res.status(500).json({erro:"Erro"});} });
app.put('/admin/afiliados/:id/pagar', authMiddleware, async (req, res) => { try{await prisma.afiliado.update({where:{id:parseInt(req.params.id)},data:{saldo:0}}); res.json({msg:"Zerado"});}catch(e){res.status(500).json({erro:"Erro"});} });
app.get('/admin/stats', authMiddleware, async (req, res) => { try{const v=await prisma.pedido.aggregate({_sum:{valorTotal:true}}); const tp=await prisma.pedido.count(); const tpr=await prisma.produto.count(); const eb=await prisma.produto.count({where:{estoque:{lt:5}}}); const up=await prisma.pedido.findMany({take:5,orderBy:{createdAt:'desc'}}); res.json({totalVendas:v._sum.valorTotal||0,totalPedidos:tp,totalProdutos:tpr,estoqueBaixo:eb,ultimosPedidos:up});}catch(e){res.status(500).json({erro:"Erro"});} });
app.get('/admin/pedidos', authMiddleware, async (req, res) => { const p=await prisma.pedido.findMany({orderBy:{createdAt:'desc'}}); res.json(p); });
app.get('/admin/produtos', authMiddleware, async (req, res) => { const p=await prisma.produto.findMany({orderBy:{createdAt:'desc'}}); res.json(p); });
app.post('/admin/produtos', authMiddleware, async(req,res)=>{ try{const n=await prisma.produto.create({data:{...req.body, preco_novo:parseFloat(req.body.preco_novo), estoque:parseInt(req.body.estoque)}}); res.status(201).json(n);}catch(e){res.status(500).json({erro:"Erro"});} });
app.put('/admin/produtos/:id', authMiddleware, async(req,res)=>{ try{const a=await prisma.produto.update({where:{id:parseInt(req.params.id)}, data:{...req.body, preco_novo:parseFloat(req.body.preco_novo), estoque:parseInt(req.body.estoque)}}); res.json(a);}catch(e){res.status(500).json({erro:"Erro"});} });
app.delete('/admin/produtos/:id', authMiddleware, async(req,res)=>{ try{await prisma.produto.delete({where:{id:parseInt(req.params.id)}}); res.status(204).send();}catch(e){res.status(500).json({erro:"Erro"});} });
// =======================================================
// CORREÇÃO: ROTA DE BUSCAR 1 PRODUTO (USADA NO EDITAR)
// =======================================================
app.get('/admin/produtos/:id', authMiddleware, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const produto = await prisma.produto.findUnique({ where: { id: id } });
        
        if (!produto) return res.status(404).json({ erro: "Produto não encontrado" });
        
        res.json(produto);
    } catch (error) {
        console.error("Erro ao buscar produto:", error);
        res.status(500).json({ erro: "Erro interno" });
    }
});
// =======================================================

app.get('/admin/stats', authMiddleware, async (req, res) => {
    try {
        // Total Vendas
        const vendas = await prisma.pedido.aggregate({ _sum: { valorTotal: true } });
        // Contagens
        const totalPedidos = await prisma.pedido.count();
        const totalProdutos = await prisma.produto.count();
        const estoqueBaixo = await prisma.produto.count({ where: { estoque: { lt: 5 } } });
        // Últimos Pedidos
        const ultimos = await prisma.pedido.findMany({ take: 5, orderBy: { createdAt: 'desc' } });

        res.json({
            totalVendas: vendas._sum.valorTotal || 0,
            totalPedidos: totalPedidos,
            totalProdutos: totalProdutos,
            estoqueBaixo: estoqueBaixo,
            ultimosPedidos: ultimos
        });
    } catch (e) {
        console.error("Erro Stats:", e);
        res.status(500).json({ erro: "Erro stats" });
    }
});

app.listen(PORT, () => { console.log(`🚀 Servidor v5.0 (Markup) na porta ${PORT}`); });