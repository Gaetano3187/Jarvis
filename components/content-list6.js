import React, { useState, Fragment } from 'react'

import PropTypes from 'prop-types'
import { useTranslations } from 'next-intl'

const ContentList6 = (props) => {
  const [isRefundVisible, setIsRefundVisible] = useState(false)
  const [isPrivacyVisible, setIsPrivacyVisible] = useState(false)
  const [isTermsVisible, setIsTermsVisible] = useState(true)
  return (
    <>
      <div className="content-list6-container1 thq-section-padding">
        <div className="content-list6-max-width thq-section-max-width">
          <div className="content-list6-container2 thq-flex-column">
            {isTermsVisible === true && (
              <button
                onClick={() => {
                  setIsPrivacyVisible(false)
                  setIsRefundVisible(false)
                  setIsTermsVisible(true)
                }}
                className="thq-button-filled"
              >
                <span>
                  {props.button ?? (
                    <Fragment>
                      <span className="content-list6-text37">
                        Terms of service
                      </span>
                    </Fragment>
                  )}
                </span>
              </button>
            )}
            {isTermsVisible === false && (
              <button
                onClick={() => {
                  setIsPrivacyVisible(false)
                  setIsRefundVisible(false)
                  setIsTermsVisible(true)
                }}
                className="thq-button-outline"
              >
                <span>
                  {props.button ?? (
                    <Fragment>
                      <span className="content-list6-text37">
                        Terms of service
                      </span>
                    </Fragment>
                  )}
                </span>
              </button>
            )}
            {isPrivacyVisible === false && (
              <button
                onClick={() => {
                  setIsRefundVisible(false)
                  setIsPrivacyVisible(true)
                  setIsTermsVisible(false)
                }}
                className="thq-button-outline"
              >
                <span>
                  {props.button1 ?? (
                    <Fragment>
                      <span className="content-list6-text27">
                        Privacy statement
                      </span>
                    </Fragment>
                  )}
                </span>
              </button>
            )}
            {isPrivacyVisible === true && (
              <button
                onClick={() => {
                  setIsPrivacyVisible(true)
                  setIsTermsVisible(false)
                  setIsRefundVisible(false)
                }}
                className="thq-button-filled"
              >
                <span>
                  {props.button1 ?? (
                    <Fragment>
                      <span className="content-list6-text27">
                        Privacy statement
                      </span>
                    </Fragment>
                  )}
                </span>
              </button>
            )}
            {isRefundVisible === false && (
              <button
                onClick={() => {
                  setIsRefundVisible(true)
                  setIsTermsVisible(false)
                  setIsPrivacyVisible(false)
                }}
                className="thq-button-outline"
              >
                <span>
                  {props.button2 ?? (
                    <Fragment>
                      <span className="content-list6-text17">
                        Refund Policy
                      </span>
                    </Fragment>
                  )}
                </span>
              </button>
            )}
            {isRefundVisible === true && (
              <button
                onClick={() => {
                  setIsPrivacyVisible(false)
                  setIsRefundVisible(true)
                  setIsTermsVisible(false)
                }}
                className="thq-button-filled"
              >
                <span>
                  {props.button2 ?? (
                    <Fragment>
                      <span className="content-list6-text17">
                        Refund Policy
                      </span>
                    </Fragment>
                  )}
                </span>
              </button>
            )}
          </div>
          <div className="content-list6-container3 thq-flex-column">
            {isTermsVisible === true && (
              <div className="content-list6-container4">
                <ul className="content-list6-ul1 thq-flex-column">
                  <li className="content-list6-li10 thq-flex-column list-item">
                    <h2 className="content-list6-heading7 thq-heading-2">
                      {props.heading7 ?? (
                        <Fragment>
                          <span className="content-list6-text35">
                            Terms of service
                          </span>
                        </Fragment>
                      )}
                    </h2>
                    <p className="thq-body-small">
                      {props.content7 ?? (
                        <Fragment>
                          <span className="content-list6-text31">
                            Lorem ipsum dolor sit amet. Vel dolores illum est
                            aperiam quis nam voluptatem quia et omnis autem qui
                            dolore ullam sed fugiat cumque! Qui accusamus
                            assumenda et molestias eius et error sunt. Id
                            recusandae nostrum ea officiis voluptatem in nisi
                            consequatur sed quia tenetur sit alias molestias qui
                            illum soluta. Est nesciunt perferendis eum sint
                            rerum 33 cupiditate dolorem id corrupti laboriosam
                            ut debitis veniam ut ipsam fugit vel sunt
                            consequatur. Et nobis quasi et cumque adipisci aut
                            molestiae eligendi quo inventore dicta ea suscipit
                            sequi sed veritatis nemo.
                          </span>
                        </Fragment>
                      )}
                    </p>
                    <ul className="content-list6-ul2 thq-flex-column">
                      <li className="list-item">
                        <h3 className="thq-heading-3">
                          {props.heading8 ?? (
                            <Fragment>
                              <span className="content-list6-text43">
                                General Terms and Conditions
                              </span>
                            </Fragment>
                          )}
                        </h3>
                        <p className="thq-body-small">
                          {props.content2 ?? (
                            <Fragment>
                              <span className="content-list6-text23">
                                Lorem ipsum dolor sit amet. Nam nihil facilis
                                sit consequuntur internos qui minima rerum ut
                                molestias laudantium aut iusto deserunt. Aut
                                voluptatibus excepturi qui officia laudantium
                                est repellendus tempore hic sunt debitis. Ut
                                galisum tempore in enim fugit eum pariatur
                                possimus est tenetur nemo et sint sint et
                                dolores Quis. Aut illum perspiciatis rem
                                architecto culpa et fuga aliquid. Est omnis
                                praesentium ut nisi internos rem quod totam et
                                similique quis. Est tempore cumque aut
                                recusandae labore qui error molestiae et
                                possimus quia! Eum Quis asperiores non nihil
                                tempora qui quia voluptatem aut aspernatur
                                aspernatur aut asperiores labore et sapiente
                                quaerat qui suscipit quia. Ea nesciunt iste aut
                                temporibus culpa sit dignissimos quaerat eum
                                architecto voluptatum et nemo velit At harum
                                harum.
                              </span>
                            </Fragment>
                          )}
                        </p>
                      </li>
                      <li className="list-item">
                        <h3 className="thq-heading-3">
                          {props.heading9 ?? (
                            <Fragment>
                              <span className="content-list6-text39">
                                Products and Services
                              </span>
                            </Fragment>
                          )}
                        </h3>
                        <p className="thq-body-small">
                          {props.content9 ?? (
                            <Fragment>
                              <span className="content-list6-text19">
                                Lorem ipsum dolor sit amet. Est vitae blanditiis
                                ab aliquam tempore aut ipsam iusto in sunt
                                repellat ex voluptatum inventore ab facilis
                                galisum ea consequatur consequuntur. Ab voluptas
                                voluptatem eum consequatur aspernatur non
                                laboriosam atque est labore asperiores a neque
                                quos. Ea nemo modi hic dicta saepe et veritatis
                                maiores At praesentium aliquid. Sed dolores
                                architecto non doloribus quia eos consectetur
                                commodi non tenetur vitae est neque omnis. Non
                                perspiciatis velit At aliquam rerum ut officiis
                                ipsa id minima eius ut sapiente nobis et nemo
                                neque. Aut maiores tempora in officiis sunt eum
                                voluptatem tenetur sit iste reprehenderit ea
                                nisi dolor. Ea impedit omnis ad internos autem
                                ut esse sunt ad saepe maiores vel perferendis
                                veritatis. Ex magni fugiat ut reprehenderit
                                laudantium sit galisum ipsam eos tempora
                                doloribus sed accusantium nobis eum praesentium
                                quod.
                              </span>
                            </Fragment>
                          )}
                        </p>
                      </li>
                    </ul>
                  </li>
                </ul>
              </div>
            )}
            {isPrivacyVisible === true && (
              <div className="content-list6-container5">
                <ul className="thq-flex-column">
                  <li className="content-list6-li13 thq-flex-column list-item">
                    <h1 className="content-list6-heading1 thq-heading-2">
                      {props.heading1 ?? (
                        <Fragment>
                          <span className="content-list6-text38">
                            Privacy statement
                          </span>
                        </Fragment>
                      )}
                    </h1>
                    <span className="thq-body-small">
                      {props.content1 ?? (
                        <Fragment>
                          <span className="content-list6-text33">
                            Lorem ipsum dolor sit amet. Vel dolores illum est
                            aperiam quis nam voluptatem quia et omnis autem qui
                            dolore ullam sed fugiat cumque! Qui accusamus
                            assumenda et molestias eius et error sunt. Id
                            recusandae nostrum ea officiis voluptatem in nisi
                            consequatur sed quia tenetur sit alias molestias qui
                            illum soluta. Est nesciunt perferendis eum sint
                            rerum 33 cupiditate dolorem id corrupti laboriosam
                            ut debitis veniam ut ipsam fugit vel sunt
                            consequatur. Et nobis quasi et cumque adipisci aut
                            molestiae eligendi quo inventore dicta ea suscipit
                            sequi sed veritatis nemo.
                          </span>
                        </Fragment>
                      )}
                    </span>
                    <ul className="content-list6-ul4 thq-flex-column">
                      <li className="list-item">
                        <h1 className="thq-heading-3">
                          {props.heading2 ?? (
                            <Fragment>
                              <span className="content-list6-text36">
                                Types of data we collect
                              </span>
                            </Fragment>
                          )}
                        </h1>
                        <p className="thq-body-small">
                          {props.content2 ?? (
                            <Fragment>
                              <span className="content-list6-text23">
                                Lorem ipsum dolor sit amet. Nam nihil facilis
                                sit consequuntur internos qui minima rerum ut
                                molestias laudantium aut iusto deserunt. Aut
                                voluptatibus excepturi qui officia laudantium
                                est repellendus tempore hic sunt debitis. Ut
                                galisum tempore in enim fugit eum pariatur
                                possimus est tenetur nemo et sint sint et
                                dolores Quis. Aut illum perspiciatis rem
                                architecto culpa et fuga aliquid. Est omnis
                                praesentium ut nisi internos rem quod totam et
                                similique quis. Est tempore cumque aut
                                recusandae labore qui error molestiae et
                                possimus quia! Eum Quis asperiores non nihil
                                tempora qui quia voluptatem aut aspernatur
                                aspernatur aut asperiores labore et sapiente
                                quaerat qui suscipit quia. Ea nesciunt iste aut
                                temporibus culpa sit dignissimos quaerat eum
                                architecto voluptatum et nemo velit At harum
                                harum.
                              </span>
                            </Fragment>
                          )}
                        </p>
                      </li>
                      <li className="list-item">
                        <h1 className="thq-heading-3">
                          {props.heading3 ?? (
                            <Fragment>
                              <span className="content-list6-text41">
                                How we use your data
                              </span>
                            </Fragment>
                          )}
                        </h1>
                        <span className="thq-body-small">
                          {props.content3 ?? (
                            <Fragment>
                              <span className="content-list6-text28">
                                Lorem ipsum dolor sit amet. Est vitae blanditiis
                                ab aliquam tempore aut ipsam iusto in sunt
                                repellat ex voluptatum inventore ab facilis
                                galisum ea consequatur consequuntur. Ab voluptas
                                voluptatem eum consequatur aspernatur non
                                laboriosam atque est labore asperiores a neque
                                quos. Ea nemo modi hic dicta saepe et veritatis
                                maiores At praesentium aliquid. Sed dolores
                                architecto non doloribus quia eos consectetur
                                commodi non tenetur vitae est neque omnis. Non
                                perspiciatis velit At aliquam rerum ut officiis
                                ipsa id minima eius ut sapiente nobis et nemo
                                neque. Aut maiores tempora in officiis sunt eum
                                voluptatem tenetur sit iste reprehenderit ea
                                nisi dolor. Ea impedit omnis ad internos autem
                                ut esse sunt ad saepe maiores vel perferendis
                                veritatis. Ex magni fugiat ut reprehenderit
                                laudantium sit galisum ipsam eos tempora
                                doloribus sed accusantium nobis eum praesentium
                                quod.
                              </span>
                            </Fragment>
                          )}
                        </span>
                      </li>
                      <li className="list-item">
                        <h1 className="thq-heading-3">
                          {props.heading4 ?? (
                            <Fragment>
                              <span className="content-list6-text16">
                                Sharing your data with 3rd parties
                              </span>
                            </Fragment>
                          )}
                        </h1>
                        <span className="thq-body-small">
                          {props.content4 ?? (
                            <Fragment>
                              <span className="content-list6-text42">
                                Lorem ipsum dolor sit amet. Id galisum officiis
                                rem quod internos qui provident quaerat hic
                                minus eveniet est officiis galisum sit rerum
                                dignissimos. Sit voluptatem alias et veniam
                                rerum ea quod ipsam ut quam neque est nihil
                                repellat est aspernatur voluptatem est voluptas
                                ratione? Ea vero tempore At soluta temporibus 33
                                galisum excepturi quo modi distinctio. Qui dolor
                                soluta sit ipsam vitae et suscipit molestiae est
                                consequatur galisum aut sapiente voluptatem sed
                                quas eaque et minima minus? Rem soluta
                                consequatur et velit cupiditate sed eligendi
                                laudantium rem pariatur galisum sit mollitia
                                debitis eum delectus ipsum aut consequatur
                                mollitia. Qui voluptatibus molestias ut totam
                                Quis ea unde dolorem sit animi eveniet et
                                galisum explicabo. Est culpa error ut
                                voluptatibus voluptatem qui dignissimos dolorem
                                quo laborum distinctio qui omnis perspiciatis ab
                                facilis temporibus qui perspiciatis consectetur.
                                Ab praesentium fugiat eos veritatis quam ex modi
                                autem et sapiente dolorem?
                              </span>
                            </Fragment>
                          )}
                        </span>
                      </li>
                      <li className="list-item">
                        <h1 className="thq-heading-3">
                          {props.heading5 ?? (
                            <Fragment>
                              <span className="content-list6-text22">
                                Campaign tracking
                              </span>
                            </Fragment>
                          )}
                        </h1>
                        <span className="thq-body-small">
                          {props.content5 ?? (
                            <Fragment>
                              <span className="content-list6-text20">
                                Lorem ipsum dolor sit amet. Ut cumque cupiditate
                                eos perferendis tempora et ullam quis qui fugiat
                                necessitatibus qui quia dolorem 33 earum
                                reprehenderit eum rerum blanditiis. Et vitae
                                distinctio 33 magni ratione ut odit rerum est
                                nihil error et minus dolor quo harum fugiat. Eos
                                quam assumenda id fugit optio aut magni sunt! Ut
                                iure aliquam vel velit modi sit voluptatibus
                                atque ut corporis sint sit omnis enim a pariatur
                                officiis aut nulla voluptate. In facere incidunt
                                aut sapiente maxime qui quibusdam facilis non
                                officia consectetur sit laboriosam libero aut
                                cupiditate possimus ut sunt reiciendis. Et
                                repudiandae magnam aut quaerat ipsam aut
                                repellat laboriosam. Ab facilis deleniti ut
                                voluptas molestiae sed omnis maiores ut aliquid
                                culpa vel nesciunt saepe. Aut placeat aspernatur
                                aut alias nihil vel neque recusandae et corrupti
                                accusantium ab quod temporibus ut nulla eaque et
                                magnam nemo. Ad sunt minus rem earum delectus
                                hic officia iste qui sunt quos non officiis illo
                                vel doloribus perspiciatis. Ab soluta eius sed
                                quidem dolores rem necessitatibus minus 33 minus
                                commodi. Nam repudiandae libero non laboriosam
                                voluptate et saepe fuga vel repudiandae pariatur
                                aut assumenda illo.
                              </span>
                            </Fragment>
                          )}
                        </span>
                      </li>
                      <li className="list-item">
                        <h1 className="thq-heading-3">
                          {props.heading6 ?? (
                            <Fragment>
                              <span className="content-list6-text34">
                                Cookies
                              </span>
                            </Fragment>
                          )}
                        </h1>
                        <span className="thq-body-small">
                          {props.content6 ?? (
                            <Fragment>
                              <span className="content-list6-text40">
                                Ut doloremque aliquam qui veniam deserunt sit
                                voluptates iusto et unde quod ut quam unde ut
                                nemo eius! Ut saepe consequuntur non quibusdam
                                soluta aut maiores eaque et rerum error nam
                                incidunt saepe aut nihil voluptatem. 33 nulla
                                quaerat est doloremque voluptatem ut libero
                                magnam id placeat aliquid. Ea minus totam est
                                inventore minus sed temporibus aperiam At
                                ratione maiores eum libero consequatur aut
                                laborum exercitationem.
                              </span>
                            </Fragment>
                          )}
                        </span>
                      </li>
                    </ul>
                  </li>
                </ul>
              </div>
            )}
            {isRefundVisible === true && (
              <div className="content-list6-container6">
                <ul className="content-list6-ul5 thq-flex-column">
                  <li className="content-list6-li19 thq-flex-column list-item">
                    <h1 className="content-list6-heading10 thq-heading-2">
                      {props.heading10 ?? (
                        <Fragment>
                          <span className="content-list6-text30">
                            Refund Policy
                          </span>
                        </Fragment>
                      )}
                    </h1>
                    <span className="thq-body-small">
                      {props.content10 ?? (
                        <Fragment>
                          <span className="content-list6-text18">
                            Lorem ipsum dolor sit amet. Vel dolores illum est
                            aperiam quis nam voluptatem quia et omnis autem qui
                            dolore ullam sed fugiat cumque! Qui accusamus
                            assumenda et molestias eius et error sunt. Id
                            recusandae nostrum ea officiis voluptatem in nisi
                            consequatur sed quia tenetur sit alias molestias qui
                            illum soluta. Est nesciunt perferendis eum sint
                            rerum 33 cupiditate dolorem id corrupti laboriosam
                            ut debitis veniam ut ipsam fugit vel sunt
                            consequatur. Et nobis quasi et cumque adipisci aut
                            molestiae eligendi quo inventore dicta ea suscipit
                            sequi sed veritatis nemo.
                          </span>
                        </Fragment>
                      )}
                    </span>
                    <ul className="content-list6-ul6 thq-flex-column">
                      <li className="list-item">
                        <h1 className="thq-heading-3">
                          {props.heading11 ?? (
                            <Fragment>
                              <span className="content-list6-text29">
                                General
                              </span>
                            </Fragment>
                          )}
                        </h1>
                        <span className="thq-body-small">
                          {props.content11 ?? (
                            <Fragment>
                              <span className="content-list6-text24">
                                Lorem ipsum dolor sit amet. Nam nihil facilis
                                sit consequuntur internos qui minima rerum ut
                                molestias laudantium aut iusto deserunt. Aut
                                voluptatibus excepturi qui officia laudantium
                                est repellendus tempore hic sunt debitis. Ut
                                galisum tempore in enim fugit eum pariatur
                                possimus est tenetur nemo et sint sint et
                                dolores Quis. Aut illum perspiciatis rem
                                architecto culpa et fuga aliquid. Est omnis
                                praesentium ut nisi internos rem quod totam et
                                similique quis. Est tempore cumque aut
                                recusandae labore qui error molestiae et
                                possimus quia! Eum Quis asperiores non nihil
                                tempora qui quia voluptatem aut aspernatur
                                aspernatur aut asperiores labore et sapiente
                                quaerat qui suscipit quia. Ea nesciunt iste aut
                                temporibus culpa sit dignissimos quaerat eum
                                architecto voluptatum et nemo velit At harum
                                harum.
                              </span>
                            </Fragment>
                          )}
                        </span>
                      </li>
                      <li className="list-item">
                        <h1 className="thq-heading-3">
                          {props.heading12 ?? (
                            <Fragment>
                              <span className="content-list6-text25">
                                Damages and issues
                              </span>
                            </Fragment>
                          )}
                        </h1>
                        <span className="thq-body-small">
                          {props.content12 ?? (
                            <Fragment>
                              <span className="content-list6-text21">
                                Lorem ipsum dolor sit amet. Est vitae blanditiis
                                ab aliquam tempore aut ipsam iusto in sunt
                                repellat ex voluptatum inventore ab facilis
                                galisum ea consequatur consequuntur. Ab voluptas
                                voluptatem eum consequatur aspernatur non
                                laboriosam atque est labore asperiores a neque
                                quos. Ea nemo modi hic dicta saepe et veritatis
                                maiores At praesentium aliquid. Sed dolores
                                architecto non doloribus quia eos consectetur
                                commodi non tenetur vitae est neque omnis. Non
                                perspiciatis velit At aliquam rerum ut officiis
                                ipsa id minima eius ut sapiente nobis et nemo
                                neque. Aut maiores tempora in officiis sunt eum
                                voluptatem tenetur sit iste reprehenderit ea
                                nisi dolor. Ea impedit omnis ad internos autem
                                ut esse sunt ad saepe maiores vel perferendis
                                veritatis. Ex magni fugiat ut reprehenderit
                                laudantium sit galisum ipsam eos tempora
                                doloribus sed accusantium nobis eum praesentium
                                quod.
                              </span>
                            </Fragment>
                          )}
                        </span>
                      </li>
                      <li className="list-item">
                        <h1 className="thq-heading-3">
                          {props.heading13 ?? (
                            <Fragment>
                              <span className="content-list6-text26">
                                Refunds
                              </span>
                            </Fragment>
                          )}
                        </h1>
                        <span className="thq-body-small">
                          {props.content13 ?? (
                            <Fragment>
                              <span className="content-list6-text32">
                                Lorem ipsum dolor sit amet. Est vitae blanditiis
                                ab aliquam tempore aut ipsam iusto in sunt
                                repellat ex voluptatum inventore ab facilis
                                galisum ea consequatur consequuntur. Ab voluptas
                                voluptatem eum consequatur aspernatur non
                                laboriosam atque est labore asperiores a neque
                                quos. Ea nemo modi hic dicta saepe et veritatis
                                maiores At praesentium aliquid. Sed dolores
                                architecto non doloribus quia eos consectetur
                                commodi non tenetur vitae est neque omnis. Non
                                perspiciatis velit At aliquam rerum ut officiis
                                ipsa id minima eius ut sapiente nobis et nemo
                                neque. Aut maiores tempora in officiis sunt eum
                                voluptatem tenetur sit iste reprehenderit ea
                                nisi dolor. Ea impedit omnis ad internos autem
                                ut esse sunt ad saepe maiores vel perferendis
                                veritatis. Ex magni fugiat ut reprehenderit
                                laudantium sit galisum ipsam eos tempora
                                doloribus sed accusantium nobis eum praesentium
                                quod.
                              </span>
                            </Fragment>
                          )}
                        </span>
                      </li>
                    </ul>
                  </li>
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
      <style jsx>
        {`
          .content-list6-container1 {
            width: 100%;
            height: auto;
            display: flex;
            position: relative;
            align-items: center;
            flex-direction: column;
          }
          .content-list6-max-width {
            width: 100%;
            display: flex;
            max-width: var(--dl-layout-size-maxwidth);
            align-items: flex-start;
            flex-direction: row;
          }
          .content-list6-container2 {
            flex: 0 0 auto;
            width: auto;
            display: flex;
            align-items: stretch;
            padding-top: var(--dl-layout-space-threeunits);
            flex-direction: column;
            justify-content: center;
          }
          .content-list6-container3 {
            width: auto;
            padding: var(--dl-layout-space-twounits);
            align-items: flex-start;
          }
          .content-list6-container4 {
            align-self: stretch;
            align-items: flex-start;
          }
          .content-list6-ul1 {
            align-items: flex-start;
          }
          .content-list6-li10 {
            align-items: flex-start;
          }
          .content-list6-heading7 {
            align-self: center;
            text-align: center;
          }
          .content-list6-ul2 {
            align-items: flex-start;
            padding-left: var(--dl-layout-space-fiveunits);
          }
          .content-list6-container5 {
            align-self: stretch;
            align-items: flex-start;
          }
          .content-list6-li13 {
            align-items: flex-start;
          }
          .content-list6-heading1 {
            align-self: center;
            text-align: center;
          }
          .content-list6-ul4 {
            align-items: flex-start;
            padding-left: var(--dl-layout-space-fiveunits);
          }
          .content-list6-container6 {
            align-self: stretch;
            align-items: flex-start;
          }
          .content-list6-ul5 {
            align-items: flex-start;
          }
          .content-list6-li19 {
            align-items: flex-start;
          }
          .content-list6-heading10 {
            align-self: center;
            text-align: center;
          }
          .content-list6-ul6 {
            align-items: flex-start;
            padding-left: var(--dl-layout-space-fiveunits);
          }
          .content-list6-text16 {
            display: inline-block;
          }
          .content-list6-text17 {
            display: inline-block;
          }
          .content-list6-text18 {
            display: inline-block;
          }
          .content-list6-text19 {
            display: inline-block;
          }
          .content-list6-text20 {
            display: inline-block;
          }
          .content-list6-text21 {
            display: inline-block;
          }
          .content-list6-text22 {
            display: inline-block;
          }
          .content-list6-text23 {
            display: inline-block;
          }
          .content-list6-text24 {
            display: inline-block;
          }
          .content-list6-text25 {
            display: inline-block;
          }
          .content-list6-text26 {
            display: inline-block;
          }
          .content-list6-text27 {
            display: inline-block;
          }
          .content-list6-text28 {
            display: inline-block;
          }
          .content-list6-text29 {
            display: inline-block;
          }
          .content-list6-text30 {
            display: inline-block;
          }
          .content-list6-text31 {
            display: inline-block;
          }
          .content-list6-text32 {
            display: inline-block;
          }
          .content-list6-text33 {
            display: inline-block;
          }
          .content-list6-text34 {
            display: inline-block;
          }
          .content-list6-text35 {
            display: inline-block;
          }
          .content-list6-text36 {
            display: inline-block;
          }
          .content-list6-text37 {
            display: inline-block;
          }
          .content-list6-text38 {
            display: inline-block;
          }
          .content-list6-text39 {
            display: inline-block;
          }
          .content-list6-text40 {
            display: inline-block;
          }
          .content-list6-text41 {
            display: inline-block;
          }
          .content-list6-text42 {
            display: inline-block;
          }
          .content-list6-text43 {
            display: inline-block;
          }
          @media (max-width: 767px) {
            .content-list6-max-width {
              align-items: center;
              flex-direction: column;
            }
            .content-list6-container2 {
              align-self: center;
            }
            .content-list6-container3 {
              padding-left: 0px;
              padding-right: 0px;
            }
            .content-list6-ul2 {
              padding-left: var(--dl-layout-space-threeunits);
            }
            .content-list6-ul4 {
              padding-left: var(--dl-layout-space-threeunits);
            }
            .content-list6-ul6 {
              padding-left: var(--dl-layout-space-threeunits);
            }
          }
          @media (max-width: 479px) {
            .content-list6-max-width {
              flex-direction: column;
            }
            .content-list6-container2 {
              align-self: center;
            }
            .content-list6-ul2 {
              padding-left: var(--dl-layout-space-oneandhalfunits);
            }
            .content-list6-ul4 {
              padding-left: var(--dl-layout-space-oneandhalfunits);
            }
            .content-list6-ul6 {
              padding-left: var(--dl-layout-space-oneandhalfunits);
            }
          }
        `}
      </style>
    </>
  )
}

ContentList6.defaultProps = {
  heading4: undefined,
  button2: undefined,
  content10: undefined,
  content9: undefined,
  content5: undefined,
  content12: undefined,
  heading5: undefined,
  content2: undefined,
  content11: undefined,
  heading12: undefined,
  heading13: undefined,
  button1: undefined,
  content3: undefined,
  heading11: undefined,
  heading10: undefined,
  content7: undefined,
  content13: undefined,
  content1: undefined,
  heading6: undefined,
  heading7: undefined,
  heading2: undefined,
  button: undefined,
  heading1: undefined,
  heading9: undefined,
  content6: undefined,
  heading3: undefined,
  content4: undefined,
  heading8: undefined,
}

ContentList6.propTypes = {
  heading4: PropTypes.element,
  button2: PropTypes.element,
  content10: PropTypes.element,
  content9: PropTypes.element,
  content5: PropTypes.element,
  content12: PropTypes.element,
  heading5: PropTypes.element,
  content2: PropTypes.element,
  content11: PropTypes.element,
  heading12: PropTypes.element,
  heading13: PropTypes.element,
  button1: PropTypes.element,
  content3: PropTypes.element,
  heading11: PropTypes.element,
  heading10: PropTypes.element,
  content7: PropTypes.element,
  content13: PropTypes.element,
  content1: PropTypes.element,
  heading6: PropTypes.element,
  heading7: PropTypes.element,
  heading2: PropTypes.element,
  button: PropTypes.element,
  heading1: PropTypes.element,
  heading9: PropTypes.element,
  content6: PropTypes.element,
  heading3: PropTypes.element,
  content4: PropTypes.element,
  heading8: PropTypes.element,
}

export default ContentList6
