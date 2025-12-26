const API_URL = ''; // Deixe vazio se estiver no mesmo domínio

// ============================================================
// INICIALIZAÇÃO
// ============================================================
document.addEventListener("DOMContentLoaded", () => {
    verificarLogin();
    
    // CONFIGURAÇÃO DAS DATAS PADRÃO (Primeiro dia do mês -> Hoje)
    const hoje = new Date();
    const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1);

    const elInicio = document.getElementById('data-inicio');
    const elFim = document.getElementById('data-fim');

    // Formata para YYYY-MM-DD (necessário para o input type="date")
    if(elInicio) elInicio.value = primeiroDia.toISOString().split('T')[0];
    if(elFim) elFim.value = hoje.toISOString().split('T')[0];
});

let AFILIADO_TOKEN = null;
window.TODAS_VENDAS = []; // 🟢 NOVA VARIÁVEL GLOBAL PARA GUARDAR AS VENDAS

function verificarLogin() {
    // Tenta pegar o login
    const dadosAntigos = localStorage.getItem('afiliadoLogado');
    const tokenSimples = localStorage.getItem('afiliadoToken');

    if (dadosAntigos) {
        const dados = JSON.parse(dadosAntigos);
        AFILIADO_TOKEN = dados.token;
    } else if (tokenSimples) {
        AFILIADO_TOKEN = tokenSimples;
    } else {
        alert("Sessão expirada. Faça login novamente.");
        window.location.href = 'index.html';
        return;
    }

    // Configura Botão Sair
    const btnSair = document.getElementById('logout-btn') || document.querySelector('.btn-sair');
    if(btnSair) {
        btnSair.onclick = (e) => {
            e.preventDefault();
            localStorage.removeItem('afiliadoLogado');
            localStorage.removeItem('afiliadoToken');
            window.location.href = 'index.html';
        }
    }

    // CARREGA TUDO
    carregarDashboardCompleto();
    carregarMeusOrcamentos();
    carregarMeusClientes();
    carregarMeusSaques();
    iniciarNotificacoes();
}

// ============================================================
// 1. CARREGAR DADOS DO DASHBOARD E VENDAS
// ============================================================
async function carregarDashboardCompleto() {
    try {
        const res = await fetch(`${API_URL}/afiliado/dashboard`, {
            headers: { 'Authorization': `Bearer ${AFILIADO_TOKEN}` }
        });

        if (!res.ok) throw new Error("Erro ao buscar dados");

        const dados = await res.json();

        // 🟢 GUARDA AS VENDAS NA VARIÁVEL GLOBAL PARA O FILTRO DE DATA
        window.TODAS_VENDAS = dados.vendas || [];
        
        // CHAMA O CÁLCULO INICIAL (Pelo período padrão)
        calcularVendasPorPeriodo();

        // 1. Preenche Topo
        const elNome = document.getElementById('nome-afiliado');
        if(elNome) elNome.innerText = `Olá, ${dados.nome}!`;

        const elSaldo = document.getElementById('saldo-total');
        if(elSaldo) elSaldo.innerText = parseFloat(dados.saldo).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});

        const elQtd = document.getElementById('qtd-vendas');
        if(elQtd && dados.vendas) {
            const aprovadas = dados.vendas.filter(v => v.status === 'APROVADO').length;
            elQtd.innerText = aprovadas;
        }

        const elLink = document.getElementById('link-afiliado');
        if(elLink && dados.codigo) {
            elLink.value = `${window.location.origin}/index.html?ref=${dados.codigo}`;
        }

        // 2. PREENCHE AS TABELAS
        preencherTabelaVendas('lista-ultimas-vendas', dados.vendas.slice(0, 5));
        preencherTabelaVendas('lista-todas-vendas', dados.vendas);

        // 3. Preenche Dados Bancários
        if(document.getElementById('input-pix')) document.getElementById('input-pix').value = dados.chavePix || '';

    } catch (error) {
        console.error("Erro Fatal:", error);
    }
}

// 🟢 FUNÇÃO ATUALIZADA: SÓ SOMA APROVADOS/ENTREGUES
function calcularVendasPorPeriodo() {
    const elInicio = document.getElementById('data-inicio');
    const elFim = document.getElementById('data-fim');
    const elTotal = document.getElementById('total-periodo-valor');
    
    if(!elInicio || !elFim || !elTotal) return;

    const inicioStr = elInicio.value; 
    const fimStr = elFim.value;

    if (!inicioStr || !fimStr) return;

    let totalPeriodo = 0;

    if (window.TODAS_VENDAS) {
        window.TODAS_VENDAS.forEach(v => {
            // ==========================================================
            // AQUI ESTÁ A MUDANÇA:
            // Só entra na soma se o status for APROVADO ou ENTREGUE.
            // Pendentes e Cancelados são ignorados.
            // ==========================================================
            if (v.status === 'APROVADO' || v.status === 'ENTREGUE') {
                
                // Pega a data da venda
                const dataVendaStr = new Date(v.createdAt).toISOString().split('T')[0];

                // Verifica se está dentro do período selecionado
                if (dataVendaStr >= inicioStr && dataVendaStr <= fimStr) {
                    totalPeriodo += parseFloat(v.valorTotal || 0);
                }
            }
        });
    }

    elTotal.innerText = totalPeriodo.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
}

// Função auxiliar para desenhar tabelas
function preencherTabelaVendas(elementId, vendas) {
    const tbody = document.getElementById(elementId);
    if(!tbody) return;

    tbody.innerHTML = ''; 

    if (!vendas || vendas.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;">Nenhuma venda encontrada.</td></tr>';
        return;
    }

    vendas.forEach(v => {
        const data = new Date(v.createdAt).toLocaleDateString('pt-BR');
        const valor = parseFloat(v.valorTotal).toLocaleString('pt-BR', {style:'currency', currency:'BRL'});
        const comissao = parseFloat(v.comissaoGerada || 0).toLocaleString('pt-BR', {style:'currency', currency:'BRL'});
        
        let statusStyle = "background:#eee; color:#333;";
        if(v.status === 'APROVADO') statusStyle = "background:#d4edda; color:#155724;";
        if(v.status === 'PENDENTE') statusStyle = "background:#fff3cd; color:#856404;";
        if(v.status === 'CANCELADO') statusStyle = "background:#f8d7da; color:#721c24;";

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${data}</td>
            <td>${v.clienteNome || 'Cliente'}</td>
            <td>${valor}</td>
            <td><span style="color:#27ae60; font-weight:bold;">+ ${comissao}</span></td>
            <td><span style="padding:4px 8px; border-radius:4px; font-size:0.8rem; font-weight:bold; ${statusStyle}">${v.status || 'PENDENTE'}</span></td>
        `;
        tbody.appendChild(tr);
    });
}

// ============================================================
// 2. CARREGAR MEUS ORÇAMENTOS
// ============================================================
async function carregarMeusOrcamentos() {
    const tbody = document.getElementById('lista-orcamentos-salvos');
    if(!tbody) return;

    try {
        const res = await fetch(`${API_URL}/afiliado/orcamentos`, {
            headers: { 'Authorization': `Bearer ${AFILIADO_TOKEN}` }
        });
        const lista = await res.json();

        tbody.innerHTML = '';

        if (!lista || lista.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px; color:#7f8c8d;">Nenhum orçamento salvo ainda.</td></tr>';
            return;
        }

        lista.forEach(orc => {
            const data = new Date(orc.createdAt).toLocaleDateString('pt-BR');
            const totalDisplay = orc.total > 0 ? parseFloat(orc.total).toLocaleString('pt-BR', {style:'currency', currency:'BRL'}) : "Sob Consulta";
            
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${orc.nome}</strong></td>
                <td>${data}</td>
                <td style="color:#27ae60;">${totalDisplay}</td>
                <td>
                    <button onclick="restaurarOrcamento('${encodeURIComponent(orc.itens)}')" style="background:#3498db; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer; margin-right:5px;">
                        <i class="ph ph-shopping-cart"></i> Abrir
                    </button>
                    <button onclick="excluirOrcamento(${orc.id})" style="background:#c0392b; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer;">
                        <i class="ph ph-trash"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });

    } catch (e) {
        console.error("Erro orçamentos:", e);
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:red;">Erro ao carregar orçamentos.</td></tr>';
    }
}

function restaurarOrcamento(itensEncoded) {
    if(!confirm("Isso vai substituir o carrinho atual pelo deste orçamento. Continuar?")) return;
    try {
        const itensString = decodeURIComponent(itensEncoded);
        JSON.parse(itensString);
        localStorage.setItem('nossoCarrinho', itensString);
        window.location.href = 'cart.html'; 
    } catch(e) {
        console.error("Erro ao restaurar:", e);
        alert("Erro ao processar os itens deste orçamento.");
    }
}

async function excluirOrcamento(id) {
    if(!confirm("Deseja excluir este orçamento?")) return;
    try {
        await fetch(`${API_URL}/orcamentos/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${AFILIADO_TOKEN}` }
        });
        carregarMeusOrcamentos();
    } catch(e) { alert("Erro ao excluir"); }
}

// ============================================================
// 3. CARREGAR MEUS CLIENTES
// ============================================================
async function carregarMeusClientes() {
    const tbody = document.getElementById('lista-clientes');
    if(!tbody) return;

    try {
        const res = await fetch(`${API_URL}/afiliado/meus-clientes`, {
            headers: { 'Authorization': `Bearer ${AFILIADO_TOKEN}` }
        });
        const clientes = await res.json();

        tbody.innerHTML = '';

        if (!clientes || clientes.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" align="center" style="padding:20px;">Nenhum cliente na sua carteira ainda.</td></tr>';
            return;
        }

        clientes.forEach(c => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${c.nome}</strong></td>
                <td>
                    ${c.email}<br>
                    ${c.telefone ? `<small>📞 ${c.telefone}</small>` : ''}
                </td>
                <td>${parseFloat(c.totalGasto).toLocaleString('pt-BR', {style:'currency', currency:'BRL'})}</td>
                <td>${new Date(c.ultimaCompra).toLocaleDateString('pt-BR')}</td>
                <td>
                    <a href="https://wa.me/?text=Olá ${c.nome}, tudo bem?" target="_blank" style="color:#27ae60; text-decoration:none; font-weight:bold;">
                        <i class="ph ph-whatsapp-logo"></i> Contatar
                    </a>
                </td>
            `;
            tbody.appendChild(tr);
        });

    } catch(e) {
        console.error(e);
        tbody.innerHTML = '<tr><td colspan="5" align="center" style="color:red">Erro ao buscar clientes.</td></tr>';
    }
}

// ============================================================
// UTILITÁRIOS E NAVEGAÇÃO
// ============================================================
function mudarAba(abaId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('nav a').forEach(el => el.classList.remove('active'));

    const tab = document.getElementById(abaId);
    const nav = document.getElementById('nav-' + abaId);

    if(tab) tab.classList.add('active');
    if(nav) nav.classList.add('active');
}

async function salvarDadosBancarios() {
    const dados = {
        chavePix: document.getElementById('input-pix').value,
        banco: document.getElementById('input-banco').value,
        agencia: document.getElementById('input-agencia').value,
        conta: document.getElementById('input-conta').value
    };
    try {
        const res = await fetch(`${API_URL}/afiliado/perfil`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${AFILIADO_TOKEN}` },
            body: JSON.stringify(dados)
        });
        if(res.ok) alert("✅ Dados salvos!");
        else alert("Erro ao salvar.");
    } catch(e) { alert("Erro de conexão."); }
}

// ============================================================
// 5. SISTEMA DE NOTIFICAÇÕES
// ============================================================
function iniciarNotificacoes() {
    verificarNotificacoes(); 
    setInterval(verificarNotificacoes, 15000); 
}

async function verificarNotificacoes() {
    if(!AFILIADO_TOKEN) return;
    try {
        const res = await fetch(`${API_URL}/afiliado/notificacoes`, {
            headers: { 'Authorization': `Bearer ${AFILIADO_TOKEN}` }
        });
        if(!res.ok) return;

        const dados = await res.json();
        const total = dados.mensagens.length + dados.vendas.length;
        const badge = document.getElementById('notif-badge');
        const lista = document.getElementById('notif-list');

        if(badge) {
            if(total > 0) {
                badge.style.display = 'block';
                badge.innerText = total > 9 ? '9+' : total;
            } else {
                badge.style.display = 'none';
            }
        }

        if(!lista) return;

        lista.innerHTML = '';
        if(total === 0) {
            lista.innerHTML = '<div style="padding:15px; text-align:center; color:#999; font-size:0.9rem;">Sem novidades por enquanto. 💤</div>';
            return;
        }

        dados.vendas.forEach(v => {
            const valor = parseFloat(v.valorTotal).toLocaleString('pt-BR', {style:'currency', currency:'BRL'});
            lista.innerHTML += `
                <div class="notif-item" style="border-left: 4px solid #27ae60;">
                    <i class="ph ph-currency-circle-dollar" style="color:#27ae60; font-size:1.5rem; margin-top:2px;"></i>
                    <div>
                        <strong>Nova Venda!</strong><br>
                        <span style="color:#555;">${valor}</span>
                    </div>
                </div>`;
        });

        dados.mensagens.forEach(m => {
            lista.innerHTML += `
                <div class="notif-item" style="border-left: 4px solid #3498db;">
                    <i class="ph ph-chat-centered-text" style="color:#3498db; font-size:1.5rem; margin-top:2px;"></i>
                    <div>
                        <strong>Admin diz:</strong><br>
                        <span style="color:#555;">${m.texto.substring(0, 40)}${m.texto.length>40?'...':''}</span>
                        ${m.arquivo ? '<br><small style="color:#e67e22;">📎 Contém anexo</small>' : ''}
                    </div>
                </div>`;
        });

    } catch(e) { console.error("Erro no sino:", e); }
}

function abrirNotificacoes() {
    const dropdown = document.getElementById('notif-dropdown');
    if(!dropdown) return;
    if(dropdown.style.display === 'block') {
        dropdown.style.display = 'none';
    } else {
        dropdown.style.display = 'block';
        marcarLidas(); 
    }
}

async function marcarLidas() {
    if(!AFILIADO_TOKEN) return;
    try {
        await fetch(`${API_URL}/afiliado/notificacoes/ler`, {
            method: 'POST', headers: { 'Authorization': `Bearer ${AFILIADO_TOKEN}` }
        });
        const badge = document.getElementById('notif-badge');
        if(badge) badge.style.display = 'none';
    } catch(e) { console.error("Erro ao marcar lidas", e); }
}

window.addEventListener('click', (e) => {
    const container = document.getElementById('box-sino');
    const dropdown = document.getElementById('notif-dropdown');
    if (container && dropdown && !container.contains(e.target)) {
        dropdown.style.display = 'none';
    }
});

// ============================================================
// FUNÇÃO DE SOLICITAR SAQUE
// ============================================================
async function solicitarSaque() {
    if(!confirm("Deseja solicitar o saque de todo o saldo disponível?")) return;
    const btn = document.getElementById('btn-saque'); 
    const textoOriginal = btn ? btn.innerText : "Solicitar Saque";
    
    if(btn) {
        btn.innerText = "Processando...";
        btn.disabled = true;
        btn.style.opacity = "0.7";
    }

    try {
        const res = await fetch(`${API_URL}/afiliado/saque`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${AFILIADO_TOKEN}` }
        });
        const data = await res.json();

        if (res.ok) {
            alert(
                "✅ Solicitação Enviada com Sucesso!\n\n" +
                `Valor Solicitado: R$ ${parseFloat(data.valor).toFixed(2)}\n\n` +
                "🕒 O pagamento será realizado em até 3 dias úteis."
            );
            carregarDashboardCompleto();
        } else {
            alert("Atenção: " + (data.erro || "Falha ao solicitar."));
        }

    } catch (e) {
        alert("Erro de conexão com o servidor.");
    } finally {
        if(btn) {
            btn.innerText = textoOriginal;
            btn.disabled = false;
            btn.style.opacity = "1";
        }
    }
}

// ============================================================
// 4. CARREGAR MEUS SAQUES
// ============================================================
async function carregarMeusSaques() {
    const tbody = document.getElementById('lista-saques');
    if(!tbody) return;

    try {
        const res = await fetch(`${API_URL}/afiliado/saques`, {
            headers: { 'Authorization': `Bearer ${AFILIADO_TOKEN}` }
        });
        const saques = await res.json();
        tbody.innerHTML = '';
        if (!saques || saques.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" align="center" style="color:#777; padding:15px;">Nenhum saque solicitado.</td></tr>';
            return;
        }

        saques.forEach(s => {
            const dataSol = new Date(s.dataSolicitacao).toLocaleDateString('pt-BR');
            const dataPag = s.dataPagamento ? new Date(s.dataPagamento).toLocaleDateString('pt-BR') : '-';
            const valor = parseFloat(s.valor).toLocaleString('pt-BR', {style:'currency', currency:'BRL'});
            
            let statusBadge = `<span style="background:#fff3cd; color:#856404; padding:4px 8px; border-radius:4px; font-weight:bold; font-size:0.7rem;">PENDENTE ⏳</span>`;
            if(s.status === 'PAGO') {
                statusBadge = `<span style="background:#d4edda; color:#155724; padding:4px 8px; border-radius:4px; font-weight:bold; font-size:0.7rem;">PAGO ✅</span>`;
            }

            let btnComprovante = '-';
            if (s.comprovante) {
                const link = s.comprovante.replace(/\\/g, '/');
                btnComprovante = `
                    <a href="${API_URL}/${link}" target="_blank" style="background:#3498db; color:white; padding:4px 8px; border-radius:4px; text-decoration:none; font-size:0.8rem; display:inline-flex; align-items:center; gap:3px;">
                        <i class="ph ph-file-text"></i> Ver
                    </a>
                `;
            }

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${dataSol}</td>
                <td><strong>${valor}</strong></td>
                <td>${dataPag}</td>
                <td>${statusBadge}</td>
                <td>${btnComprovante}</td> 
            `;
            tbody.appendChild(tr);
        });
    } catch(e) {
        console.error(e);
        tbody.innerHTML = '<tr><td colspan="5" align="center" style="color:red">Erro ao carregar saques.</td></tr>';
    }
}