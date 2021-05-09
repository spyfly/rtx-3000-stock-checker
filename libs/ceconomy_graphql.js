const fetch = require('cross-fetch');
const { ApolloClient, InMemoryCache, gql, useQuery, HttpLink, ApolloLink } = require('@apollo/client');
const { createPersistedQueryLink } = require('@apollo/client/link/persisted-queries');
const { sha256 } = require('crypto-hash');

//const url = 'https://www.mediamarkt.de/api/v1/graphql';
const url = 'http://localhost:5555/graphql'

const persistedQueriesLink = createPersistedQueryLink({ sha256 });
const httpLink = new HttpLink({ uri: url, fetch });

const client = new ApolloClient({
    link: persistedQueriesLink.concat(httpLink),
    cache: new InMemoryCache(),
});

const query = client
    .query({
        query: gql`
        query GetProductCollectionItems($items: [ProductCollectionItemInput!]!, $storeId: String) {
            getProductCollectionItems(items: $items) {
                visible {
                    __typename
                    ... on GraphqlCampaignProductCollectionProduct {
                        ...ProductCollectionProduct
                    }
                    ... on GraphqlCampaignProductCollectionBundle {
                        ...ProductCollectionBundle
                    }
                    ... on GraphqlCampaignProductCollectionTeaser {
                        ...ProductCollectionTeaser
                    }
                }
            }
        }`,
    })
console.log(query)