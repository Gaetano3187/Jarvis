import React, { useState, Fragment } from 'react'

import PropTypes from 'prop-types'
import { useTranslations } from 'next-intl'

const Pricing142 = (props) => {
  const [isMonthly, setIsMonthly] = useState(true)
  return (
    <>
      <div className="pricing142-pricing23 thq-section-padding">
        <div className="pricing142-max-width thq-section-max-width">
          <div className="pricing142-section-title">
            <span className="pricing142-text100 thq-body-small">
              {props.content1 ?? (
                <Fragment>
                  <span className="pricing142-text160">
                    Choose the perfect plan for you
                  </span>
                </Fragment>
              )}
            </span>
            <div className="pricing142-content">
              <h2 className="pricing142-text101 thq-heading-2">
                {props.heading1 ?? (
                  <Fragment>
                    <span className="pricing142-text178">Pricing plan</span>
                  </Fragment>
                )}
              </h2>
              <p className="pricing142-text102 thq-body-large">
                {props.content2 ?? (
                  <Fragment>
                    <span className="pricing142-text163">
                      Lorem ipsum dolor sit amet, consectetur adipiscing elit.
                      <span
                        dangerouslySetInnerHTML={{
                          __html: ' ',
                        }}
                      />
                    </span>
                  </Fragment>
                )}
              </p>
            </div>
          </div>
          <div className="pricing142-tabs">
            {isMonthly === true && (
              <button
                onClick={() => setIsMonthly(true)}
                className="pricing142-button10 thq-button-filled thq-button-animated"
              >
                <span className="thq-body-small">Monthly</span>
              </button>
            )}
            {isMonthly === false && (
              <button
                onClick={() => setIsMonthly(true)}
                className="pricing142-button11 thq-button-outline thq-button-animated"
              >
                <span className="thq-body-small">Monthly</span>
              </button>
            )}
            {isMonthly === false && (
              <button
                onClick={() => setIsMonthly(false)}
                className="pricing142-button12 thq-button-filled thq-button-animated"
              >
                <span className="thq-body-small">Yearly</span>
              </button>
            )}
            {isMonthly === true && (
              <button
                onClick={() => setIsMonthly(false)}
                className="pricing142-button13 thq-button-outline thq-button-animated"
              >
                <span className="thq-body-small">Yearly</span>
              </button>
            )}
          </div>
          {isMonthly === true && (
            <div className="pricing142-container1">
              <div className="pricing142-column1 thq-card">
                <div className="pricing142-price10">
                  <div className="pricing142-price11">
                    <p className="pricing142-text107 thq-body-large">
                      {props.plan1 ?? (
                        <Fragment>
                          <span className="pricing142-text166">Basic plan</span>
                        </Fragment>
                      )}
                    </p>
                    <h3 className="pricing142-text108 thq-heading-3">
                      {props.plan1Price ?? (
                        <Fragment>
                          <span className="pricing142-text173">
                            $9.99/month
                          </span>
                        </Fragment>
                      )}
                    </h3>
                    <p className="thq-body-large">
                      {props.plan1Yearly ?? (
                        <Fragment>
                          <span className="pricing142-text186">
                            or $200 yearly
                          </span>
                        </Fragment>
                      )}
                    </p>
                  </div>
                  <div className="pricing142-list1">
                    <div className="pricing142-list-item10">
                      <svg viewBox="0 0 1024 1024" className="thq-icon-small">
                        <path d="M384 690l452-452 60 60-512 512-238-238 60-60z"></path>
                      </svg>
                      <span className="thq-body-small">
                        {props.plan1Feature1 ?? (
                          <Fragment>
                            <span className="pricing142-text184">
                              Feature 1
                            </span>
                          </Fragment>
                        )}
                      </span>
                    </div>
                    <div className="pricing142-list-item11">
                      <svg viewBox="0 0 1024 1024" className="thq-icon-small">
                        <path d="M384 690l452-452 60 60-512 512-238-238 60-60z"></path>
                      </svg>
                      <span className="thq-body-small">
                        {props.plan1Feature2 ?? (
                          <Fragment>
                            <span className="pricing142-text169">
                              Feature 2
                            </span>
                          </Fragment>
                        )}
                      </span>
                    </div>
                    <div className="pricing142-list-item12">
                      <svg viewBox="0 0 1024 1024" className="thq-icon-small">
                        <path d="M384 690l452-452 60 60-512 512-238-238 60-60z"></path>
                      </svg>
                      <span className="thq-body-small">
                        {props.plan1Feature3 ?? (
                          <Fragment>
                            <span className="pricing142-text175">
                              Feature 3
                            </span>
                          </Fragment>
                        )}
                      </span>
                    </div>
                  </div>
                </div>
                <button className="pricing142-button14 thq-button-outline thq-button-animated">
                  <span className="thq-body-small">
                    {props.plan1Action ?? (
                      <Fragment>
                        <span className="pricing142-text192">Sign Up</span>
                      </Fragment>
                    )}
                  </span>
                </button>
              </div>
              <div className="pricing142-column2 thq-card">
                <div className="pricing142-price12">
                  <div className="pricing142-price13">
                    <p className="pricing142-text114 thq-body-large">
                      {props.plan2 ?? (
                        <Fragment>
                          <span className="pricing142-text180">
                            Business plan
                          </span>
                        </Fragment>
                      )}
                    </p>
                    <h3 className="pricing142-text115 thq-heading-3">
                      {props.plan2Price ?? (
                        <Fragment>
                          <span className="pricing142-text168">
                            $19.99/month
                          </span>
                        </Fragment>
                      )}
                    </h3>
                    <p className="thq-body-large">
                      {props.plan2Yearly ?? (
                        <Fragment>
                          <span className="pricing142-text174">
                            or $299 yearly
                          </span>
                        </Fragment>
                      )}
                    </p>
                  </div>
                  <div className="pricing142-list2">
                    <div className="pricing142-list-item13">
                      <svg viewBox="0 0 1024 1024" className="thq-icon-small">
                        <path d="M384 690l452-452 60 60-512 512-238-238 60-60z"></path>
                      </svg>
                      <span className="thq-body-small">
                        {props.plan2Feature1 ?? (
                          <Fragment>
                            <span className="pricing142-text164">
                              Feature 1
                            </span>
                          </Fragment>
                        )}
                      </span>
                    </div>
                    <div className="pricing142-list-item14">
                      <svg viewBox="0 0 1024 1024" className="thq-icon-small">
                        <path d="M384 690l452-452 60 60-512 512-238-238 60-60z"></path>
                      </svg>
                      <span className="thq-body-small">
                        {props.plan2Feature2 ?? (
                          <Fragment>
                            <span className="pricing142-text179">
                              Feature 2
                            </span>
                          </Fragment>
                        )}
                      </span>
                    </div>
                    <div className="pricing142-list-item15">
                      <svg viewBox="0 0 1024 1024" className="thq-icon-small">
                        <path d="M384 690l452-452 60 60-512 512-238-238 60-60z"></path>
                      </svg>
                      <span className="thq-body-small">
                        {props.plan2Feature3 ?? (
                          <Fragment>
                            <span className="pricing142-text170">
                              Feature 3
                            </span>
                          </Fragment>
                        )}
                      </span>
                    </div>
                    <div className="pricing142-list-item16">
                      <svg viewBox="0 0 1024 1024" className="thq-icon-small">
                        <path d="M384 690l452-452 60 60-512 512-238-238 60-60z"></path>
                      </svg>
                      <span className="thq-body-small">
                        {props.plan2Feature4 ?? (
                          <Fragment>
                            <span className="pricing142-text172">
                              Feature text goes here
                            </span>
                          </Fragment>
                        )}
                      </span>
                    </div>
                  </div>
                </div>
                <button className="pricing142-button15 thq-button-filled thq-button-animated">
                  <span className="thq-body-small">
                    {props.plan2Action ?? (
                      <Fragment>
                        <span className="pricing142-text203">Sign Up</span>
                      </Fragment>
                    )}
                  </span>
                </button>
              </div>
              <div className="pricing142-column3 thq-card">
                <div className="pricing142-price14">
                  <div className="pricing142-price15">
                    <p className="pricing142-text122 thq-body-large">
                      {props.plan3 ?? (
                        <Fragment>
                          <span className="pricing142-text181">
                            Enterprise plan
                          </span>
                        </Fragment>
                      )}
                    </p>
                    <h3 className="pricing142-text123 thq-heading-3">
                      {props.plan3Price ?? (
                        <Fragment>
                          <span className="pricing142-text190">
                            $29.99/month
                          </span>
                        </Fragment>
                      )}
                    </h3>
                    <p className="thq-body-large">
                      {props.plan3Yearly ?? (
                        <Fragment>
                          <span className="pricing142-text176">
                            or $499 yearly
                          </span>
                        </Fragment>
                      )}
                    </p>
                  </div>
                  <div className="pricing142-list3">
                    <div className="pricing142-list-item17">
                      <svg viewBox="0 0 1024 1024" className="thq-icon-small">
                        <path d="M384 690l452-452 60 60-512 512-238-238 60-60z"></path>
                      </svg>
                      <span className="thq-body-small">
                        {props.plan3Feature1 ?? (
                          <Fragment>
                            <span className="pricing142-text165">
                              Feature 1
                            </span>
                          </Fragment>
                        )}
                      </span>
                    </div>
                    <div className="pricing142-list-item18">
                      <svg viewBox="0 0 1024 1024" className="thq-icon-small">
                        <path d="M384 690l452-452 60 60-512 512-238-238 60-60z"></path>
                      </svg>
                      <span className="thq-body-small">
                        {props.plan3Feature2 ?? (
                          <Fragment>
                            <span className="pricing142-text205">
                              Feature 2
                            </span>
                          </Fragment>
                        )}
                      </span>
                    </div>
                    <div className="pricing142-list-item19">
                      <svg viewBox="0 0 1024 1024" className="thq-icon-small">
                        <path d="M384 690l452-452 60 60-512 512-238-238 60-60z"></path>
                      </svg>
                      <span className="thq-body-small">
                        {props.plan3Feature3 ?? (
                          <Fragment>
                            <span className="pricing142-text193">
                              Feature 3
                            </span>
                          </Fragment>
                        )}
                      </span>
                    </div>
                    <div className="pricing142-list-item20">
                      <svg viewBox="0 0 1024 1024" className="thq-icon-small">
                        <path d="M384 690l452-452 60 60-512 512-238-238 60-60z"></path>
                      </svg>
                      <span className="thq-body-small">
                        {props.plan3Feature4 ?? (
                          <Fragment>
                            <span className="pricing142-text191">
                              Feature text goes here
                            </span>
                          </Fragment>
                        )}
                      </span>
                    </div>
                    <div className="pricing142-list-item21">
                      <svg viewBox="0 0 1024 1024" className="thq-icon-small">
                        <path d="M384 690l452-452 60 60-512 512-238-238 60-60z"></path>
                      </svg>
                      <span className="thq-body-small">
                        {props.plan3Feature5 ?? (
                          <Fragment>
                            <span className="pricing142-text195">
                              Feature text goes here
                            </span>
                          </Fragment>
                        )}
                      </span>
                    </div>
                  </div>
                </div>
                <button className="pricing142-button16 thq-button-filled thq-button-animated">
                  <span className="thq-body-small">
                    {props.plan3Action ?? (
                      <Fragment>
                        <span className="pricing142-text196">Sign Up</span>
                      </Fragment>
                    )}
                  </span>
                </button>
              </div>
            </div>
          )}
          {isMonthly === false && (
            <div className="pricing142-container2">
              <div className="pricing142-column4 thq-card">
                <div className="pricing142-price16">
                  <div className="pricing142-price17">
                    <span className="pricing142-text131 thq-body-large">
                      {props.plan11 ?? (
                        <Fragment>
                          <span className="pricing142-text161">Basic plan</span>
                        </Fragment>
                      )}
                    </span>
                    <h3 className="pricing142-text132 thq-heading-3">
                      {props.plan1Price1 ?? (
                        <Fragment>
                          <span className="pricing142-text204">$200/yr</span>
                        </Fragment>
                      )}
                    </h3>
                    <span className="thq-body-large">
                      {props.plan1Yearly1 ?? (
                        <Fragment>
                          <span className="pricing142-text183">
                            or $20 monthly
                          </span>
                        </Fragment>
                      )}
                    </span>
                  </div>
                  <div className="pricing142-list4">
                    <div className="pricing142-list-item22">
                      <svg viewBox="0 0 1024 1024" className="thq-icon-small">
                        <path d="M384 690l452-452 60 60-512 512-238-238 60-60z"></path>
                      </svg>
                      <span className="thq-body-small">
                        {props.plan1Feature11 ?? (
                          <Fragment>
                            <span className="pricing142-text167">
                              Feature text goes here
                            </span>
                          </Fragment>
                        )}
                      </span>
                    </div>
                    <div className="pricing142-list-item23">
                      <svg viewBox="0 0 1024 1024" className="thq-icon-small">
                        <path d="M384 690l452-452 60 60-512 512-238-238 60-60z"></path>
                      </svg>
                      <span className="thq-body-small">
                        {props.plan1Feature21 ?? (
                          <Fragment>
                            <span className="pricing142-text156">
                              Feature text goes here
                            </span>
                          </Fragment>
                        )}
                      </span>
                    </div>
                    <div className="pricing142-list-item24">
                      <svg viewBox="0 0 1024 1024" className="thq-icon-small">
                        <path d="M384 690l452-452 60 60-512 512-238-238 60-60z"></path>
                      </svg>
                      <span className="thq-body-small">
                        {props.plan1Feature31 ?? (
                          <Fragment>
                            <span className="pricing142-text202">
                              Feature text goes here
                            </span>
                          </Fragment>
                        )}
                      </span>
                    </div>
                  </div>
                </div>
                <button className="pricing142-button17 thq-button-outline thq-button-animated">
                  <span className="thq-body-small">
                    {props.plan1Action1 ?? (
                      <Fragment>
                        <span className="pricing142-text200">Get started</span>
                      </Fragment>
                    )}
                  </span>
                </button>
              </div>
              <div className="pricing142-column5 thq-card">
                <div className="pricing142-price18">
                  <div className="pricing142-price19">
                    <span className="pricing142-text138 thq-body-large">
                      {props.plan21 ?? (
                        <Fragment>
                          <span className="pricing142-text201">
                            Business plan
                          </span>
                        </Fragment>
                      )}
                    </span>
                    <h3 className="pricing142-text139 thq-heading-3">
                      {props.plan2Price1 ?? (
                        <Fragment>
                          <span className="pricing142-text194">$299/yr</span>
                        </Fragment>
                      )}
                    </h3>
                    <span className="thq-body-large">
                      {props.plan2Yearly1 ?? (
                        <Fragment>
                          <span className="pricing142-text155">
                            or $29 monthly
                          </span>
                        </Fragment>
                      )}
                    </span>
                  </div>
                  <div className="pricing142-list5">
                    <div className="pricing142-list-item25">
                      <svg viewBox="0 0 1024 1024" className="thq-icon-small">
                        <path d="M384 690l452-452 60 60-512 512-238-238 60-60z"></path>
                      </svg>
                      <span className="thq-body-small">
                        {props.plan2Feature11 ?? (
                          <Fragment>
                            <span className="pricing142-text177">
                              Feature text goes here
                            </span>
                          </Fragment>
                        )}
                      </span>
                    </div>
                    <div className="pricing142-list-item26">
                      <svg viewBox="0 0 1024 1024" className="thq-icon-small">
                        <path d="M384 690l452-452 60 60-512 512-238-238 60-60z"></path>
                      </svg>
                      <span className="thq-body-small">
                        {props.plan2Feature21 ?? (
                          <Fragment>
                            <span className="pricing142-text197">
                              Feature text goes here
                            </span>
                          </Fragment>
                        )}
                      </span>
                    </div>
                    <div className="pricing142-list-item27">
                      <svg viewBox="0 0 1024 1024" className="thq-icon-small">
                        <path d="M384 690l452-452 60 60-512 512-238-238 60-60z"></path>
                      </svg>
                      <span className="thq-body-small">
                        {props.plan2Feature31 ?? (
                          <Fragment>
                            <span className="pricing142-text199">
                              Feature text goes here
                            </span>
                          </Fragment>
                        )}
                      </span>
                    </div>
                    <div className="pricing142-list-item28">
                      <svg viewBox="0 0 1024 1024" className="thq-icon-small">
                        <path d="M384 690l452-452 60 60-512 512-238-238 60-60z"></path>
                      </svg>
                      <span className="thq-body-small">
                        {props.plan2Feature41 ?? (
                          <Fragment>
                            <span className="pricing142-text185">
                              Feature text goes here
                            </span>
                          </Fragment>
                        )}
                      </span>
                    </div>
                  </div>
                </div>
                <button className="pricing142-button18 thq-button-filled thq-button-animated">
                  <span className="thq-body-small">
                    {props.plan2Action1 ?? (
                      <Fragment>
                        <span className="pricing142-text198">Get started</span>
                      </Fragment>
                    )}
                  </span>
                </button>
              </div>
              <div className="pricing142-column6 thq-card">
                <div className="pricing142-price20">
                  <div className="pricing142-price21">
                    <span className="pricing142-text146 thq-body-large">
                      {props.plan31 ?? (
                        <Fragment>
                          <span className="pricing142-text159">
                            Enterprise plan
                          </span>
                        </Fragment>
                      )}
                    </span>
                    <h3 className="pricing142-text147 thq-heading-3">
                      {props.plan3Price1 ?? (
                        <Fragment>
                          <span className="pricing142-text187">$499/yr</span>
                        </Fragment>
                      )}
                    </h3>
                    <span className="thq-body-large">
                      {props.plan3Yearly1 ?? (
                        <Fragment>
                          <span className="pricing142-text157">
                            or $49 monthly
                          </span>
                        </Fragment>
                      )}
                    </span>
                  </div>
                  <div className="pricing142-list6">
                    <div className="pricing142-list-item29">
                      <svg viewBox="0 0 1024 1024" className="thq-icon-small">
                        <path d="M384 690l452-452 60 60-512 512-238-238 60-60z"></path>
                      </svg>
                      <span className="thq-body-small">
                        {props.plan3Feature11 ?? (
                          <Fragment>
                            <span className="pricing142-text162">
                              Feature text goes here
                            </span>
                          </Fragment>
                        )}
                      </span>
                    </div>
                    <div className="pricing142-list-item30">
                      <svg viewBox="0 0 1024 1024" className="thq-icon-small">
                        <path d="M384 690l452-452 60 60-512 512-238-238 60-60z"></path>
                      </svg>
                      <span className="thq-body-small">
                        {props.plan3Feature21 ?? (
                          <Fragment>
                            <span className="pricing142-text182">
                              Feature text goes here
                            </span>
                          </Fragment>
                        )}
                      </span>
                    </div>
                    <div className="pricing142-list-item31">
                      <svg viewBox="0 0 1024 1024" className="thq-icon-small">
                        <path d="M384 690l452-452 60 60-512 512-238-238 60-60z"></path>
                      </svg>
                      <span className="thq-body-small">
                        {props.plan3Feature31 ?? (
                          <Fragment>
                            <span className="pricing142-text189">
                              Feature text goes here
                            </span>
                          </Fragment>
                        )}
                      </span>
                    </div>
                    <div className="pricing142-list-item32">
                      <svg viewBox="0 0 1024 1024" className="thq-icon-small">
                        <path d="M384 690l452-452 60 60-512 512-238-238 60-60z"></path>
                      </svg>
                      <span className="thq-body-small">
                        {props.plan3Feature41 ?? (
                          <Fragment>
                            <span className="pricing142-text188">
                              Feature text goes here
                            </span>
                          </Fragment>
                        )}
                      </span>
                    </div>
                    <div className="pricing142-list-item33">
                      <svg viewBox="0 0 1024 1024" className="thq-icon-small">
                        <path d="M384 690l452-452 60 60-512 512-238-238 60-60z"></path>
                      </svg>
                      <span className="thq-body-small">
                        {props.plan3Feature51 ?? (
                          <Fragment>
                            <span className="pricing142-text158">
                              Feature text goes here
                            </span>
                          </Fragment>
                        )}
                      </span>
                    </div>
                  </div>
                </div>
                <button className="pricing142-button19 thq-button-filled thq-button-animated">
                  <span className="thq-body-small">
                    {props.plan3Action1 ?? (
                      <Fragment>
                        <span className="pricing142-text171">Get started</span>
                      </Fragment>
                    )}
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      <style jsx>
        {`
          .pricing142-pricing23 {
            width: 100%;
            height: auto;
            display: flex;
            overflow: hidden;
            position: relative;
            align-items: center;
            flex-shrink: 0;
            flex-direction: column;
          }
          .pricing142-max-width {
            gap: var(--dl-layout-space-threeunits);
            width: 100%;
            display: flex;
            align-items: center;
            flex-direction: column;
          }
          .pricing142-section-title {
            gap: var(--dl-layout-space-unit);
            width: 100%;
            display: flex;
            max-width: 800px;
            align-items: center;
            flex-shrink: 0;
            flex-direction: column;
          }
          .pricing142-text100 {
            text-align: center;
          }
          .pricing142-content {
            gap: var(--dl-layout-space-oneandhalfunits);
            width: 100%;
            display: flex;
            max-width: 800px;
            align-self: stretch;
            align-items: center;
            flex-direction: column;
          }
          .pricing142-text101 {
            text-align: center;
          }
          .pricing142-text102 {
            text-align: center;
          }
          .pricing142-tabs {
            display: flex;
            align-items: flex-start;
          }
          .pricing142-button10 {
            gap: var(--dl-layout-space-halfunit);
            color: var(--dl-color-theme-neutral-light);
            width: 120px;
            height: 60px;
            border-top-left-radius: var(--dl-layout-radius-buttonradius);
            border-top-right-radius: 0;
            border-bottom-left-radius: var(--dl-layout-radius-buttonradius);
            border-bottom-right-radius: 0;
          }
          .pricing142-button11 {
            gap: var(--dl-layout-space-halfunit);
            width: 120px;
            height: 60px;
            border-style: solid;
            border-top-left-radius: var(--dl-layout-radius-buttonradius);
            border-top-right-radius: 0;
            border-bottom-left-radius: var(--dl-layout-radius-buttonradius);
            border-bottom-right-radius: 0;
          }
          .pricing142-button12 {
            gap: var(--dl-layout-space-halfunit);
            color: var(--dl-color-theme-neutral-light);
            width: 120px;
            height: 60px;
            border-top-left-radius: 0;
            border-top-right-radius: var(--dl-layout-radius-buttonradius);
            border-bottom-left-radius: 0;
            border-bottom-right-radius: var(--dl-layout-radius-buttonradius);
          }
          .pricing142-button13 {
            gap: var(--dl-layout-space-halfunit);
            width: 120px;
            height: 60px;
            border-style: solid;
            border-top-left-radius: 0;
            border-top-right-radius: var(--dl-layout-radius-buttonradius);
            border-bottom-left-radius: 0;
            border-bottom-right-radius: var(--dl-layout-radius-buttonradius);
          }
          .pricing142-container1 {
            gap: var(--dl-layout-space-twounits);
            width: 100%;
            display: flex;
            align-self: stretch;
            align-items: flex-start;
            flex-shrink: 0;
            animation-name: fadeIn;
            animation-delay: 0s;
            animation-duration: 300ms;
            animation-direction: normal;
            animation-iteration-count: 1;
            animation-timing-function: ease;
          }
          .pricing142-column1 {
            gap: var(--dl-layout-space-twounits);
            flex: 1;
            width: 100%;
            display: flex;
            flex-grow: 1;
            align-self: stretch;
            align-items: center;
            border-color: var(--dl-color-theme-neutral-dark);
            border-style: solid;
            border-width: 1px;
            flex-direction: column;
          }
          .pricing142-price10 {
            gap: var(--dl-layout-space-twounits);
            display: flex;
            flex-grow: 1;
            align-self: stretch;
            align-items: center;
            flex-direction: column;
          }
          .pricing142-price11 {
            gap: var(--dl-layout-space-halfunit);
            display: flex;
            align-self: stretch;
            align-items: center;
            flex-direction: column;
          }
          .pricing142-text107 {
            font-style: normal;
            font-weight: 600;
          }
          .pricing142-text108 {
            font-size: 48px;
          }
          .pricing142-list1 {
            gap: var(--dl-layout-space-unit);
            display: flex;
            align-self: stretch;
            align-items: flex-start;
            flex-direction: column;
          }
          .pricing142-list-item10 {
            gap: var(--dl-layout-space-unit);
            display: flex;
            align-self: stretch;
            align-items: flex-start;
            flex-shrink: 0;
          }
          .pricing142-list-item11 {
            gap: var(--dl-layout-space-unit);
            display: flex;
            align-self: stretch;
            align-items: flex-start;
            flex-shrink: 0;
          }
          .pricing142-list-item12 {
            gap: var(--dl-layout-space-unit);
            display: flex;
            align-self: stretch;
            align-items: flex-start;
            flex-shrink: 0;
          }
          .pricing142-button14 {
            width: 100%;
          }
          .pricing142-column2 {
            gap: var(--dl-layout-space-twounits);
            flex: 1;
            width: 100%;
            display: flex;
            flex-grow: 1;
            align-self: stretch;
            align-items: center;
            border-color: var(--dl-color-theme-neutral-dark);
            border-style: solid;
            border-width: 1px;
            flex-direction: column;
            background-color: var(--dl-color-theme-accent1);
          }
          .pricing142-price12 {
            gap: var(--dl-layout-space-twounits);
            display: flex;
            flex-grow: 1;
            align-self: stretch;
            align-items: center;
            flex-direction: column;
          }
          .pricing142-price13 {
            gap: var(--dl-layout-space-halfunit);
            display: flex;
            align-self: stretch;
            align-items: center;
            flex-direction: column;
          }
          .pricing142-text114 {
            font-style: normal;
            font-weight: 600;
          }
          .pricing142-text115 {
            font-size: 48px;
          }
          .pricing142-list2 {
            gap: var(--dl-layout-space-unit);
            display: flex;
            align-self: stretch;
            align-items: flex-start;
            flex-direction: column;
          }
          .pricing142-list-item13 {
            gap: var(--dl-layout-space-unit);
            display: flex;
            align-self: stretch;
            align-items: flex-start;
            flex-shrink: 0;
          }
          .pricing142-list-item14 {
            gap: var(--dl-layout-space-unit);
            display: flex;
            align-self: stretch;
            align-items: flex-start;
            flex-shrink: 0;
          }
          .pricing142-list-item15 {
            gap: var(--dl-layout-space-unit);
            display: flex;
            align-self: stretch;
            align-items: flex-start;
            flex-shrink: 0;
          }
          .pricing142-list-item16 {
            gap: var(--dl-layout-space-unit);
            display: flex;
            align-self: stretch;
            align-items: flex-start;
            flex-shrink: 0;
          }
          .pricing142-button15 {
            width: 100%;
          }
          .pricing142-column3 {
            gap: var(--dl-layout-space-twounits);
            flex: 1;
            width: 100%;
            display: flex;
            flex-grow: 1;
            align-items: center;
            flex-shrink: 0;
            border-color: var(--dl-color-theme-neutral-dark);
            border-style: solid;
            border-width: 1px;
            flex-direction: column;
            background-color: var(--dl-color-theme-accent2);
          }
          .pricing142-price14 {
            gap: var(--dl-layout-space-twounits);
            display: flex;
            align-self: stretch;
            align-items: center;
            flex-direction: column;
          }
          .pricing142-price15 {
            gap: var(--dl-layout-space-halfunit);
            display: flex;
            align-self: stretch;
            align-items: center;
            flex-direction: column;
          }
          .pricing142-text122 {
            font-style: normal;
            font-weight: 600;
          }
          .pricing142-text123 {
            font-size: 48px;
          }
          .pricing142-list3 {
            gap: var(--dl-layout-space-unit);
            display: flex;
            align-self: stretch;
            align-items: flex-start;
            flex-direction: column;
          }
          .pricing142-list-item17 {
            gap: var(--dl-layout-space-unit);
            display: flex;
            align-self: stretch;
            align-items: flex-start;
            flex-shrink: 0;
          }
          .pricing142-list-item18 {
            gap: var(--dl-layout-space-unit);
            display: flex;
            align-self: stretch;
            align-items: flex-start;
            flex-shrink: 0;
          }
          .pricing142-list-item19 {
            gap: var(--dl-layout-space-unit);
            display: flex;
            align-self: stretch;
            align-items: flex-start;
            flex-shrink: 0;
          }
          .pricing142-list-item20 {
            gap: var(--dl-layout-space-unit);
            display: flex;
            align-self: stretch;
            align-items: flex-start;
            flex-shrink: 0;
          }
          .pricing142-list-item21 {
            gap: var(--dl-layout-space-unit);
            display: flex;
            align-self: stretch;
            align-items: flex-start;
            flex-shrink: 0;
          }
          .pricing142-button16 {
            width: 100%;
          }
          .pricing142-container2 {
            gap: 32px;
            width: 100%;
            display: flex;
            align-self: stretch;
            align-items: flex-start;
            flex-shrink: 0;
            animation-name: fadeIn;
            animation-delay: 0s;
            animation-duration: 300ms;
            animation-direction: normal;
            animation-iteration-count: 1;
            animation-timing-function: ease;
          }
          .pricing142-column4 {
            gap: var(--dl-layout-space-twounits);
            flex: 1;
            width: 100%;
            display: flex;
            flex-grow: 1;
            align-self: stretch;
            align-items: center;
            border-color: var(--dl-color-theme-neutral-dark);
            border-style: solid;
            border-width: 1px;
            flex-direction: column;
          }
          .pricing142-price16 {
            gap: var(--dl-layout-space-twounits);
            display: flex;
            flex-grow: 1;
            align-self: stretch;
            align-items: center;
            flex-direction: column;
          }
          .pricing142-price17 {
            gap: var(--dl-layout-space-halfunit);
            display: flex;
            align-self: stretch;
            align-items: center;
            flex-direction: column;
          }
          .pricing142-text131 {
            font-style: normal;
            font-weight: 600;
          }
          .pricing142-text132 {
            font-size: 48px;
          }
          .pricing142-list4 {
            gap: var(--dl-layout-space-unit);
            display: flex;
            align-self: stretch;
            align-items: flex-start;
            flex-direction: column;
          }
          .pricing142-list-item22 {
            gap: var(--dl-layout-space-unit);
            display: flex;
            align-self: stretch;
            align-items: flex-start;
            flex-shrink: 0;
          }
          .pricing142-list-item23 {
            gap: var(--dl-layout-space-unit);
            display: flex;
            align-self: stretch;
            align-items: flex-start;
            flex-shrink: 0;
          }
          .pricing142-list-item24 {
            gap: var(--dl-layout-space-unit);
            display: flex;
            align-self: stretch;
            align-items: flex-start;
            flex-shrink: 0;
          }
          .pricing142-button17 {
            width: 100%;
          }
          .pricing142-column5 {
            gap: var(--dl-layout-space-twounits);
            flex: 1;
            width: 100%;
            display: flex;
            flex-grow: 1;
            align-self: stretch;
            align-items: center;
            border-color: var(--dl-color-theme-neutral-dark);
            border-style: solid;
            border-width: 1px;
            flex-direction: column;
            background-color: var(--dl-color-theme-accent1);
          }
          .pricing142-price18 {
            gap: var(--dl-layout-space-twounits);
            display: flex;
            flex-grow: 1;
            align-self: stretch;
            align-items: center;
            flex-direction: column;
          }
          .pricing142-price19 {
            gap: var(--dl-layout-space-halfunit);
            display: flex;
            align-self: stretch;
            align-items: center;
            flex-direction: column;
          }
          .pricing142-text138 {
            font-style: normal;
            font-weight: 600;
          }
          .pricing142-text139 {
            font-size: 48px;
          }
          .pricing142-list5 {
            gap: var(--dl-layout-space-unit);
            display: flex;
            align-self: stretch;
            align-items: flex-start;
            flex-direction: column;
          }
          .pricing142-list-item25 {
            gap: var(--dl-layout-space-unit);
            display: flex;
            align-self: stretch;
            align-items: flex-start;
            flex-shrink: 0;
          }
          .pricing142-list-item26 {
            gap: var(--dl-layout-space-unit);
            display: flex;
            align-self: stretch;
            align-items: flex-start;
            flex-shrink: 0;
          }
          .pricing142-list-item27 {
            gap: var(--dl-layout-space-unit);
            display: flex;
            align-self: stretch;
            align-items: flex-start;
            flex-shrink: 0;
          }
          .pricing142-list-item28 {
            gap: var(--dl-layout-space-unit);
            display: flex;
            align-self: stretch;
            align-items: flex-start;
            flex-shrink: 0;
          }
          .pricing142-button18 {
            width: 100%;
          }
          .pricing142-column6 {
            gap: var(--dl-layout-space-twounits);
            flex: 1;
            width: 100%;
            display: flex;
            flex-grow: 1;
            align-items: center;
            flex-shrink: 0;
            border-color: var(--dl-color-theme-neutral-dark);
            border-style: solid;
            border-width: 1px;
            flex-direction: column;
            background-color: var(--dl-color-theme-accent2);
          }
          .pricing142-price20 {
            gap: var(--dl-layout-space-twounits);
            display: flex;
            align-self: stretch;
            align-items: center;
            flex-direction: column;
          }
          .pricing142-price21 {
            gap: var(--dl-layout-space-halfunit);
            display: flex;
            align-self: stretch;
            align-items: center;
            flex-direction: column;
          }
          .pricing142-text146 {
            font-style: normal;
            font-weight: 600;
          }
          .pricing142-text147 {
            font-size: 48px;
          }
          .pricing142-list6 {
            gap: var(--dl-layout-space-unit);
            display: flex;
            align-self: stretch;
            align-items: flex-start;
            flex-direction: column;
          }
          .pricing142-list-item29 {
            gap: var(--dl-layout-space-unit);
            display: flex;
            align-self: stretch;
            align-items: flex-start;
            flex-shrink: 0;
          }
          .pricing142-list-item30 {
            gap: var(--dl-layout-space-unit);
            display: flex;
            align-self: stretch;
            align-items: flex-start;
            flex-shrink: 0;
          }
          .pricing142-list-item31 {
            gap: var(--dl-layout-space-unit);
            display: flex;
            align-self: stretch;
            align-items: flex-start;
            flex-shrink: 0;
          }
          .pricing142-list-item32 {
            gap: var(--dl-layout-space-unit);
            display: flex;
            align-self: stretch;
            align-items: flex-start;
            flex-shrink: 0;
          }
          .pricing142-list-item33 {
            gap: var(--dl-layout-space-unit);
            display: flex;
            align-self: stretch;
            align-items: flex-start;
            flex-shrink: 0;
          }
          .pricing142-button19 {
            width: 100%;
          }
          .pricing142-text155 {
            display: inline-block;
          }
          .pricing142-text156 {
            display: inline-block;
          }
          .pricing142-text157 {
            display: inline-block;
          }
          .pricing142-text158 {
            display: inline-block;
          }
          .pricing142-text159 {
            display: inline-block;
          }
          .pricing142-text160 {
            display: inline-block;
          }
          .pricing142-text161 {
            display: inline-block;
          }
          .pricing142-text162 {
            display: inline-block;
          }
          .pricing142-text163 {
            display: inline-block;
          }
          .pricing142-text164 {
            display: inline-block;
          }
          .pricing142-text165 {
            display: inline-block;
          }
          .pricing142-text166 {
            display: inline-block;
          }
          .pricing142-text167 {
            display: inline-block;
          }
          .pricing142-text168 {
            display: inline-block;
          }
          .pricing142-text169 {
            display: inline-block;
          }
          .pricing142-text170 {
            display: inline-block;
          }
          .pricing142-text171 {
            display: inline-block;
          }
          .pricing142-text172 {
            display: inline-block;
          }
          .pricing142-text173 {
            display: inline-block;
          }
          .pricing142-text174 {
            display: inline-block;
          }
          .pricing142-text175 {
            display: inline-block;
          }
          .pricing142-text176 {
            display: inline-block;
          }
          .pricing142-text177 {
            display: inline-block;
          }
          .pricing142-text178 {
            display: inline-block;
          }
          .pricing142-text179 {
            display: inline-block;
          }
          .pricing142-text180 {
            display: inline-block;
          }
          .pricing142-text181 {
            display: inline-block;
          }
          .pricing142-text182 {
            display: inline-block;
          }
          .pricing142-text183 {
            display: inline-block;
          }
          .pricing142-text184 {
            display: inline-block;
          }
          .pricing142-text185 {
            display: inline-block;
          }
          .pricing142-text186 {
            display: inline-block;
          }
          .pricing142-text187 {
            display: inline-block;
          }
          .pricing142-text188 {
            display: inline-block;
          }
          .pricing142-text189 {
            display: inline-block;
          }
          .pricing142-text190 {
            display: inline-block;
          }
          .pricing142-text191 {
            display: inline-block;
          }
          .pricing142-text192 {
            display: inline-block;
          }
          .pricing142-text193 {
            display: inline-block;
          }
          .pricing142-text194 {
            display: inline-block;
          }
          .pricing142-text195 {
            display: inline-block;
          }
          .pricing142-text196 {
            display: inline-block;
          }
          .pricing142-text197 {
            display: inline-block;
          }
          .pricing142-text198 {
            display: inline-block;
          }
          .pricing142-text199 {
            display: inline-block;
          }
          .pricing142-text200 {
            display: inline-block;
          }
          .pricing142-text201 {
            display: inline-block;
          }
          .pricing142-text202 {
            display: inline-block;
          }
          .pricing142-text203 {
            display: inline-block;
          }
          .pricing142-text204 {
            display: inline-block;
          }
          .pricing142-text205 {
            display: inline-block;
          }
          @media (max-width: 991px) {
            .pricing142-container1 {
              flex-direction: column;
            }
            .pricing142-column3 {
              width: 100%;
            }
            .pricing142-container2 {
              flex-direction: column;
            }
            .pricing142-column6 {
              width: 100%;
            }
          }
          @media (max-width: 479px) {
            .pricing142-max-width {
              gap: var(--dl-layout-space-oneandhalfunits);
            }
          }
        `}
      </style>
    </>
  )
}

Pricing142.defaultProps = {
  plan2Yearly1: undefined,
  plan1Feature21: undefined,
  plan3Yearly1: undefined,
  plan3Feature51: undefined,
  plan31: undefined,
  content1: undefined,
  plan11: undefined,
  plan3Feature11: undefined,
  content2: undefined,
  plan2Feature1: undefined,
  plan3Feature1: undefined,
  plan1: undefined,
  plan1Feature11: undefined,
  plan2Price: undefined,
  plan1Feature2: undefined,
  plan2Feature3: undefined,
  plan3Action1: undefined,
  plan2Feature4: undefined,
  plan1Price: undefined,
  plan2Yearly: undefined,
  plan1Feature3: undefined,
  plan3Yearly: undefined,
  plan2Feature11: undefined,
  heading1: undefined,
  plan2Feature2: undefined,
  plan2: undefined,
  plan3: undefined,
  plan3Feature21: undefined,
  plan1Yearly1: undefined,
  plan1Feature1: undefined,
  plan2Feature41: undefined,
  plan1Yearly: undefined,
  plan3Price1: undefined,
  plan3Feature41: undefined,
  plan3Feature31: undefined,
  plan3Price: undefined,
  plan3Feature4: undefined,
  plan1Action: undefined,
  plan3Feature3: undefined,
  plan2Price1: undefined,
  plan3Feature5: undefined,
  plan3Action: undefined,
  plan2Feature21: undefined,
  plan2Action1: undefined,
  plan2Feature31: undefined,
  plan1Action1: undefined,
  plan21: undefined,
  plan1Feature31: undefined,
  plan2Action: undefined,
  plan1Price1: undefined,
  plan3Feature2: undefined,
}

Pricing142.propTypes = {
  plan2Yearly1: PropTypes.element,
  plan1Feature21: PropTypes.element,
  plan3Yearly1: PropTypes.element,
  plan3Feature51: PropTypes.element,
  plan31: PropTypes.element,
  content1: PropTypes.element,
  plan11: PropTypes.element,
  plan3Feature11: PropTypes.element,
  content2: PropTypes.element,
  plan2Feature1: PropTypes.element,
  plan3Feature1: PropTypes.element,
  plan1: PropTypes.element,
  plan1Feature11: PropTypes.element,
  plan2Price: PropTypes.element,
  plan1Feature2: PropTypes.element,
  plan2Feature3: PropTypes.element,
  plan3Action1: PropTypes.element,
  plan2Feature4: PropTypes.element,
  plan1Price: PropTypes.element,
  plan2Yearly: PropTypes.element,
  plan1Feature3: PropTypes.element,
  plan3Yearly: PropTypes.element,
  plan2Feature11: PropTypes.element,
  heading1: PropTypes.element,
  plan2Feature2: PropTypes.element,
  plan2: PropTypes.element,
  plan3: PropTypes.element,
  plan3Feature21: PropTypes.element,
  plan1Yearly1: PropTypes.element,
  plan1Feature1: PropTypes.element,
  plan2Feature41: PropTypes.element,
  plan1Yearly: PropTypes.element,
  plan3Price1: PropTypes.element,
  plan3Feature41: PropTypes.element,
  plan3Feature31: PropTypes.element,
  plan3Price: PropTypes.element,
  plan3Feature4: PropTypes.element,
  plan1Action: PropTypes.element,
  plan3Feature3: PropTypes.element,
  plan2Price1: PropTypes.element,
  plan3Feature5: PropTypes.element,
  plan3Action: PropTypes.element,
  plan2Feature21: PropTypes.element,
  plan2Action1: PropTypes.element,
  plan2Feature31: PropTypes.element,
  plan1Action1: PropTypes.element,
  plan21: PropTypes.element,
  plan1Feature31: PropTypes.element,
  plan2Action: PropTypes.element,
  plan1Price1: PropTypes.element,
  plan3Feature2: PropTypes.element,
}

export default Pricing142
