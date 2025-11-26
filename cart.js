/* =======================================================
   🛒 LÓGICA DO CARRINHO (cart.js)
   ======================================================= */

const API_URL = ''; // Deixe vazio para usar o mesmo domínio do site

// Função Principal chamada pelo script.js
async function carregarPaginaCarrinho() {
    const cartItemsContainer = document.getElementById('cart-items');
    const cartTotalElement = document.getElementById('cart-total');

    // 1. Pega o carrinho salvo ou cria lista vazia
    let cart = JSON.parse(localStorage.getItem('cart')) || [];

    // 2. Se estiver vazio, avisa
    if (cart.length === 0) {
        if (cartItemsContainer) {
            cartItemsContainer.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 20px;">Seu carrinho está vazio.</td></tr>';
        }
        if (cartTotalElement) cartTotalElement.innerText = '0,00';
        return;
    }

    // 3. Se tiver itens, vamos montar a tabela
    if (cartItemsContainer) {
        cartItemsContainer.innerHTML = ''; // Limpa antes de preencher
        let total = 0;

        for (const item of cart) {
            try {
                // Busca os detalhes atualizados do produto no banco de dados
                const response = await fetch(`${API_URL}/products/${item.id}`);
                
                if (!response.ok) {
                    // Se o produto foi deletado do banco, remove ele do carrinho visualmente
                    continue; 
                }

                const product = await response.json();
                const subtotal = product.price * item.quantity;
                total += subtotal;

                // Cria a linha da tabela (HTML)
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>
                        <img src="${product.image || 'https://via.placeholder.com/50'}" alt="${product.name}" width="50" style="border-radius:4px;">
                    </td>
                    <td>${product.name}</td>
                    <td>R$ ${Number(product.price).toFixed(2).replace('.', ',')}</td>
                    <td>
                        <div style="display: flex; align-items: center; gap: 5px;">
                            <button onclick="alterarQuantidade(${item.id}, -1)" style="padding: 2px 8px;">-</button>
                            <span>${item.quantity}</span>
                            <button onclick="alterarQuantidade(${item.id}, 1)" style="padding: 2px 8px;">+</button>
                        </div>
                    </td>
                    <td>R$ ${subtotal.toFixed(2).replace('.', ',')}</td>
                    <td>
                        <button onclick="removerItem(${item.id})" style="color: red; border: none; background: none; cursor: pointer; font-weight: bold;">X</button>
                    </td>
                `;
                cartItemsContainer.appendChild(row);

            } catch (error) {
                console.error("Erro ao carregar produto:", error);
            }
        }

        // 4. Atualiza o valor total lá embaixo
        if (cartTotalElement) {
            cartTotalElement.innerText = total.toFixed(2).replace('.', ',');
        }
    }
}

// --- Funções Auxiliares (Botões de + e -) ---

function alterarQuantidade(productId, delta) {
    let cart = JSON.parse(localStorage.getItem('cart')) || [];
    const itemIndex = cart.findIndex(p => p.id === productId);

    if (itemIndex > -1) {
        cart[itemIndex].quantity += delta;

        // Se a quantidade for zero ou menos, remove o item
        if (cart[itemIndex].quantity <= 0) {
            cart.splice(itemIndex, 1);
        }

        localStorage.setItem('cart', JSON.stringify(cart));
        atualizarContadorCarrinho(); // Atualiza a bolinha vermelha no topo
        carregarPaginaCarrinho();    // Recarrega a tabela
    }
}

function removerItem(productId) {
    let cart = JSON.parse(localStorage.getItem('cart')) || [];
    cart = cart.filter(p => p.id !== productId); // Filtra removendo o ID escolhido

    localStorage.setItem('cart', JSON.stringify(cart));
    atualizarContadorCarrinho();
    carregarPaginaCarrinho();
}

// Função para finalizar compra (Botão Checkout)
function irParaCheckout() {
    const cart = JSON.parse(localStorage.getItem('cart')) || [];
    if (cart.length === 0) {
        alert("Seu carrinho está vazio!");
        return;
    }
    window.location.href = "checkout.html";
}